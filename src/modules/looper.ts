import type { BusEvent, BusEventBody } from '../core/bus';
import { TICKS_PER_BAR } from '../core/clock';
import type { Param } from '../core/params';
import { chordForRow } from '../harmony/chordEngine';
import { pc, type HarmonySettings } from '../harmony/theory';

export type SlotId = 'verse' | 'chorus' | 'bridge';
export const SLOT_IDS: SlotId[] = ['verse', 'chorus', 'bridge'];
export type SlotState = 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped';

export interface SlotView {
  id: SlotId;
  state: SlotState;
  bars: number; // loop length; 0 until recorded
  waiting: boolean; // starts or stops at the next bar, or plays when the current loop ends
}

export interface LooperView {
  selected: SlotId;
  slots: SlotView[];
  bar: number | null; // 1-based bar of the playing loop
}

export interface LooperDeps {
  settings: () => HarmonySettings; // turns recorded table rows back into chords
  emit: (e: BusEventBody) => void; // replayed events go back onto the bus
  applyParam: (p: Param) => void; // replayed parameter moves
  now: () => number; // AudioContext time (s): places live events between grid ticks
}

/** A chord over loop positions start..end (grid ticks). Pieces of one held chord share an id. */
interface ChordRegion {
  id: number;
  row: number;
  velocity: number;
  start: number;
  end: number;
  layer: number; // 0 = the recording, then one per overdub; newer layers win
}

interface NoteRegion {
  note: number;
  tonic: number; // the tonic it was played in
  velocity: number;
  start: number;
  end: number;
}

interface Point<T> {
  pos: number;
  value: T;
}

interface Slot {
  state: SlotState;
  length: number; // grid ticks, whole bars; 0 until recorded
  layer: number; // the layer new input is recorded into
  chords: ChordRegion[];
  notes: NoteRegion[];
  mods: Point<number>[];
  params: Point<Param>[];
}

interface HeldChord {
  id: number;
  row: number;
  velocity: number;
  since: number; // grid position
}

interface HeldNote {
  tonic: number;
  velocity: number;
  since: number;
}

const emptySlot = (): Slot => ({ state: 'empty', length: 0, layer: 0, chords: [], notes: [], mods: [], params: [] });
const wrap = (n: number, m: number) => ((n % m) + m) % m;
const nextBar = (pos: number) => Math.ceil(pos / TICKS_PER_BAR) * TICKS_PER_BAR;
/** The transposition that keeps a melody nearest its recorded register when the tonic moves. */
const shift = (from: number, to: number) => pc(to - from + 6) - 6;

function activeChord(regions: ChordRegion[], pos: number): ChordRegion | null {
  let best: ChordRegion | null = null;
  for (const r of regions) {
    if (pos < r.start || pos >= r.end) continue;
    if (!best || r.layer > best.layer || (r.layer === best.layer && r.start > best.start)) best = r;
  }
  return best;
}

function clip<T extends { start: number; end: number }>(regions: T[], length: number): T[] {
  return regions
    .map((r) => ({ ...r, start: Math.max(0, r.start), end: Math.min(length, r.end) }))
    .filter((r) => r.end > r.start);
}

function clipPoints<T>(points: Point<T>[], length: number): Point<T>[] {
  return points.map((p) => ({ ...p, pos: Math.max(0, p.pos) })).filter((p) => p.pos < length);
}

/**
 * The looper (spec §5.7): three slots that record bus events — chords as table rows, melody notes
 * relative to the tonic, strum input and parameter moves — and replay them onto the bus.
 */
export class Looper {
  private slots: Record<SlotId, Slot> = { verse: emptySlot(), chorus: emptySlot(), bridge: emptySlot() };
  private selected: SlotId = 'verse';
  private clock: { tick: number; at: number; dur: number } | null = null;
  private rec: { slot: SlotId; start: number; end: number | null; started: boolean } | null = null;
  private playback: { slot: SlotId; start: number } | null = null; // start: the tick of loop position 0
  private queued: { slot: SlotId; overdub: boolean } | null = null;
  private captureFrom = 0; // grid position where the current recording or overdub begins
  private nextId = 0;
  // live input, tracked all the time
  private live: HeldChord | null = null;
  private liveNotes = new Map<number, HeldNote>();
  private sustainOn = false;
  private sustained = new Set<number>(); // live notes released under the pedal
  // what the replay is sounding
  private loopChord: ChordRegion | null = null;
  private loopChordOn = false; // the modules play the loop's chord (no live chord over it)
  private loopNotes = new Map<NoteRegion, number>(); // sounding replayed note → the note number sent
  private applying = false; // a replayed parameter is being applied
  private listeners: (() => void)[] = [];

  constructor(private deps: LooperDeps) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'tick':
        this.tick(e.tick, e.at, e.dur);
        break;
      case 'chordOn':
      case 'chordChange':
        if (e.source || (e.type === 'chordChange' && !e.retrigger)) break;
        this.endLiveChord();
        this.live = { id: this.nextId++, row: e.chord.row, velocity: e.velocity, since: this.pos() };
        this.loopChordOn = false; // the modules now play the live chord
        break;
      case 'chordOff':
        if (e.source) break;
        this.endLiveChord();
        if (this.loopChord) this.sendLoopChord(); // the loop's chord comes back
        break;
      case 'melodyOn':
        if (e.source) break;
        this.endLiveNote(e.note);
        this.liveNotes.set(e.note, { tonic: this.deps.settings().tonic, velocity: e.velocity, since: this.pos() });
        break;
      case 'melodyOff':
        if (e.source) break;
        if (this.sustainOn) this.sustained.add(e.note);
        else this.endLiveNote(e.note);
        break;
      case 'sustain':
        this.sustainOn = e.on;
        if (!e.on) {
          for (const note of this.sustained) this.endLiveNote(note);
          this.sustained.clear();
        }
        break;
      case 'mod':
        if (!e.source) this.capturePoint((s, pos) => s.mods.push({ pos, value: e.value }));
        break;
      case 'param':
        if (!this.applying) this.capturePoint((s, pos) => s.params.push({ pos, value: { key: e.key, value: e.value } }));
        break;
      case 'panic':
        this.panic();
        break;
    }
  }

  select(id: SlotId): void {
    this.selected = id;
    const pb = this.playback;
    if (pb && pb.slot !== id && this.slots[id].state === 'stopped') this.queued = { slot: id, overdub: false };
    else if (pb?.slot === id) this.queued = null;
    this.notify();
  }

  /** Rec: record an empty slot, stop a recording, toggle overdub on a playing one. */
  record(): void {
    const id = this.selected;
    const slot = this.slots[id];
    if (slot.state === 'empty') this.armRecording(id);
    else if (slot.state === 'recording') this.stopRecording();
    else if (slot.state === 'playing') this.setOverdub(slot, true);
    else if (slot.state === 'overdubbing') this.setOverdub(slot, false);
    else this.startPlayback(id, true);
    this.notify();
  }

  /** Play/stop the selected slot. */
  play(): void {
    const id = this.selected;
    const slot = this.slots[id];
    if (slot.state === 'recording') this.stopRecording();
    else if (slot.state === 'playing' || slot.state === 'overdubbing') {
      this.stopPlayback();
      this.queued = null;
    } else if (slot.state === 'stopped') this.startPlayback(id, false);
    this.notify();
  }

  clear(): void {
    const id = this.selected;
    if (this.rec?.slot === id) this.rec = null;
    if (this.playback?.slot === id) this.stopPlayback();
    if (this.queued?.slot === id) this.queued = null;
    this.slots[id] = emptySlot();
    this.notify();
  }

  /** Harmony settings changed: the loop's sounding chord follows them, keeping common notes. */
  settingsChanged(): void {
    const r = this.loopChord;
    if (!r || !this.loopChordOn) return;
    const chord = chordForRow(r.row, this.deps.settings());
    this.deps.emit({ type: 'chordChange', chord, velocity: r.velocity, retrigger: false, source: 'loop' });
  }

  view(): LooperView {
    const tick = this.clock?.tick ?? -1;
    const pb = this.playback;
    const slots = SLOT_IDS.map((id): SlotView => {
      const s = this.slots[id];
      const waiting =
        (this.rec?.slot === id && (!this.rec.started || this.rec.end !== null)) ||
        (pb?.slot === id && tick < pb.start) ||
        this.queued?.slot === id;
      return { id, state: s.state, bars: s.length / TICKS_PER_BAR, waiting };
    });
    const bar = pb && tick >= pb.start
      ? Math.floor(wrap(tick - pb.start, this.slots[pb.slot].length) / TICKS_PER_BAR) + 1
      : null;
    return { selected: this.selected, slots, bar };
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** The grid position of the audio clock's present, from the latest tick. */
  private pos(): number {
    const c = this.clock;
    return c ? c.tick + (this.deps.now() - c.at) / c.dur : 0;
  }

  // --- the clock -----------------------------------------------------------------------------

  private tick(tick: number, at: number, dur: number): void {
    this.clock = { tick, at, dur };
    const rec = this.rec;
    if (rec && !rec.started && tick >= rec.start) {
      rec.started = true;
      this.captureFrom = rec.start;
      this.stopPlayback(at); // one slot at a time
      this.queued = null;
      this.notify();
    }
    if (rec?.started && rec.end !== null && tick >= rec.end) this.finishRecording();
    const pb = this.playback;
    if (this.queued && (!pb || tick < pb.start || wrap(tick - pb.start, this.slots[pb.slot].length) === 0)) {
      const { slot, overdub } = this.queued;
      this.queued = null;
      this.stopPlayback(at);
      this.startAt(slot, tick, overdub);
    }
    this.replay(tick, at, dur);
  }

  private replay(tick: number, at: number, dur: number): void {
    const pb = this.playback;
    if (!pb || tick < pb.start) return;
    const slot = this.slots[pb.slot];
    const length = slot.length;
    const p0 = wrap(tick - pb.start, length);
    const p1 = p0 + 1;
    const time = (p: number) => at + (p - p0) * dur;
    const inside = (p: number) => p >= p0 && p < p1;
    if (p0 % TICKS_PER_BAR === 0) this.notify(); // the bar counter moves on

    for (const [r, note] of this.loopNotes) {
      const end = r.end % length; // a note that lasts to the loop end ends at the seam
      if (!inside(end)) continue;
      this.loopNotes.delete(r);
      this.deps.emit({ type: 'melodyOff', note, at: time(end), source: 'loop' });
    }
    const edges = new Set([p0]);
    for (const r of slot.chords) for (const p of [r.start, r.end]) if (p > p0 && p < p1) edges.add(p);
    for (const p of [...edges].sort((a, b) => a - b)) this.setLoopChord(activeChord(slot.chords, p), time(p));
    const tonic = this.deps.settings().tonic;
    for (const r of slot.notes) {
      if (!inside(r.start)) continue;
      const note = r.note + shift(r.tonic, tonic);
      this.deps.emit({ type: 'melodyOn', note, velocity: r.velocity, at: time(r.start), source: 'loop' });
      if (r.end < p1) this.deps.emit({ type: 'melodyOff', note, at: time(r.end), source: 'loop' }); // shorter than a tick
      else this.loopNotes.set(r, note);
    }
    for (const m of slot.mods) {
      if (inside(m.pos)) this.deps.emit({ type: 'mod', value: m.value, at: time(m.pos), source: 'loop' });
    }
    for (const p of slot.params) if (inside(p.pos)) this.apply(p.value);
  }

  private apply(p: Param): void {
    this.applying = true;
    try {
      this.deps.applyParam(p);
    } finally {
      this.applying = false;
    }
  }

  private setLoopChord(next: ChordRegion | null, at?: number): void {
    if (next?.id === this.loopChord?.id) return;
    this.loopChord = next;
    if (!this.live) this.sendLoopChord(at); // a live chord overrides the loop's while it is held
  }

  /** Puts the loop's current chord, or silence, on the bus. */
  private sendLoopChord(at?: number): void {
    const r = this.loopChord;
    if (!r) {
      if (this.loopChordOn) this.deps.emit({ type: 'chordOff', at, source: 'loop' });
      this.loopChordOn = false;
      return;
    }
    const chord = chordForRow(r.row, this.deps.settings());
    this.deps.emit(this.loopChordOn
      ? { type: 'chordChange', chord, velocity: r.velocity, retrigger: true, at, source: 'loop' }
      : { type: 'chordOn', chord, velocity: r.velocity, at, source: 'loop' });
    this.loopChordOn = true;
  }

  // --- slots ---------------------------------------------------------------------------------

  private armRecording(id: SlotId): void {
    if (this.rec) this.slots[this.rec.slot] = emptySlot(); // one recording at a time
    this.rec = { slot: id, start: nextBar(this.pos()), end: null, started: false };
    this.slots[id].state = 'recording';
  }

  private stopRecording(): void {
    const rec = this.rec!;
    if (!rec.started) {
      this.slots[rec.slot] = emptySlot();
      this.rec = null;
    } else if (rec.end === null) {
      rec.end = rec.start + Math.max(TICKS_PER_BAR, nextBar(this.pos() - rec.start));
    }
  }

  private finishRecording(): void {
    const rec = this.rec!;
    const end = rec.end!;
    const slot = this.slots[rec.slot];
    const length = end - rec.start;
    this.endCapture(end); // what is still held ends with the loop
    this.rec = null;
    slot.length = length;
    slot.chords = clip(slot.chords, length);
    slot.notes = clip(slot.notes, length);
    slot.mods = clipPoints(slot.mods, length);
    slot.params = clipPoints(slot.params, length);
    this.startAt(rec.slot, end, false);
  }

  private startPlayback(id: SlotId, overdub: boolean): void {
    if (this.playback) this.queued = { slot: id, overdub };
    else this.startAt(id, nextBar(this.pos()), overdub);
  }

  private startAt(id: SlotId, start: number, overdub: boolean): void {
    const slot = this.slots[id];
    this.playback = { slot: id, start };
    slot.state = overdub ? 'overdubbing' : 'playing';
    if (overdub) this.beginOverdub(slot, start);
    this.notify();
  }

  private setOverdub(slot: Slot, on: boolean): void {
    if (on) {
      slot.state = 'overdubbing';
      this.beginOverdub(slot, Math.max(this.pos(), this.playback!.start));
    } else {
      this.endCapture(this.pos());
      slot.state = 'playing';
    }
  }

  private beginOverdub(slot: Slot, from: number): void {
    slot.layer++;
    this.captureFrom = from;
  }

  /** Ends the playing loop and silences what it was sounding. */
  private stopPlayback(at?: number): void {
    const pb = this.playback;
    if (!pb) return;
    const slot = this.slots[pb.slot];
    if (slot.state === 'overdubbing') this.endCapture(this.pos());
    if (this.loopChordOn) this.deps.emit({ type: 'chordOff', at, source: 'loop' });
    for (const note of this.loopNotes.values()) this.deps.emit({ type: 'melodyOff', note, at, source: 'loop' });
    this.loopNotes.clear();
    this.loopChord = null;
    this.loopChordOn = false;
    this.playback = null;
    slot.state = 'stopped';
  }

  private panic(): void {
    if (this.rec) this.slots[this.rec.slot] = emptySlot();
    this.rec = null;
    const pb = this.playback;
    if (pb) {
      const slot = this.slots[pb.slot];
      if (slot.state === 'overdubbing') this.endCapture(this.pos());
      slot.state = 'stopped';
    }
    this.playback = null;
    this.queued = null;
    this.loopChord = null;
    this.loopChordOn = false;
    this.loopNotes.clear();
    this.live = null;
    this.liveNotes.clear();
    this.sustained.clear();
    this.sustainOn = false;
    this.notify();
  }

  // --- capturing live input ------------------------------------------------------------------

  /** The slot live input is being recorded into, if any. */
  private target(): Slot | null {
    if (this.rec?.started) return this.slots[this.rec.slot];
    const pb = this.playback;
    return pb && this.slots[pb.slot].state === 'overdubbing' ? this.slots[pb.slot] : null;
  }

  /** Loop positions covered by grid positions from..until of the current recording or overdub. */
  private spans(from: number, until: number): [number, number][] {
    if (this.rec?.started) return [[from - this.rec.start, until - this.rec.start]]; // clipped when it ends
    const { slot, start } = this.playback!;
    const length = this.slots[slot].length;
    if (until - from >= length) return [[0, length]];
    const s = wrap(from - start, length);
    const e = s + (until - from);
    return e <= length ? [[s, e]] : [[s, length], [0, e - length]];
  }

  private endLiveChord(): void {
    if (this.live) this.captureChord(this.live, this.pos());
    this.live = null;
  }

  private endLiveNote(note: number): void {
    const held = this.liveNotes.get(note);
    if (held) this.captureNote(note, held, this.pos());
    this.liveNotes.delete(note);
    this.sustained.delete(note);
  }

  /** Records what is still held up to `until`, where the recording or overdub ends. */
  private endCapture(until: number): void {
    if (this.live) {
      this.captureChord(this.live, until);
      this.live.since = until;
    }
    for (const [note, held] of this.liveNotes) {
      this.captureNote(note, held, until);
      held.since = until;
    }
  }

  private captureChord(held: HeldChord, until: number): void {
    const slot = this.target();
    const from = Math.max(held.since, this.captureFrom);
    if (!slot || until <= from) return;
    for (const [start, end] of this.spans(from, until)) {
      slot.chords.push({ id: held.id, row: held.row, velocity: held.velocity, start, end, layer: slot.layer });
    }
  }

  private captureNote(note: number, held: HeldNote, until: number): void {
    const slot = this.target();
    const from = Math.max(held.since, this.captureFrom);
    if (!slot || until <= from) return;
    for (const [start, end] of this.spans(from, until)) {
      slot.notes.push({ note, tonic: held.tonic, velocity: held.velocity, start, end });
    }
  }

  private capturePoint(add: (slot: Slot, pos: number) => void): void {
    const slot = this.target();
    if (!slot) return;
    const p = Math.max(this.pos(), this.captureFrom);
    add(slot, this.rec?.started ? p - this.rec.start : wrap(p - this.playback!.start, slot.length));
  }
}
