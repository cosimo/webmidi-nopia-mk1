import type { BusEvent } from '../core/bus';
import { pc, type Chord } from '../harmony/theory';
import { Voicer } from '../harmony/voicing';
import type { Module, NoteSink } from './module';

/** Strummed notes end this long after they are plucked (spec §5.6). */
export const STRUM_RELEASE_S = 1.5;

/** The chord's pitch classes laid out upward over two octaves from `low`, plus the top root. */
export function strumNotes(chord: Chord, low: number): number[] {
  const pcs = new Set(chord.intervals.map((i) => pc(chord.root + i)));
  const notes: number[] = [];
  for (let n = low; n < low + 24; n++) if (pcs.has(pc(n))) notes.push(n);
  notes.push(low + 24 + pc(chord.root - low - 24)); // the first root from two octaves up
  return notes;
}

const zoneOf = (value: number, zones: number) => Math.min(zones - 1, Math.floor((value * zones) / 128));

/** Zones entered moving from zone `from` to zone `to`, in order. */
function crossed(from: number, to: number): number[] {
  const zones: number[] = [];
  const dir = Math.sign(to - from);
  for (let z = from + dir; dir !== 0 && z !== to + dir; z += dir) zones.push(z);
  return zones;
}

/** Strums the held chord with the mod strip (CC1) (spec §5.6). */
export class StrumModule implements Module {
  readonly id = 'strum' as const;
  private voicer = new Voicer(); // follows the same chords as Keys, so it voices identically
  private chord: { notes: number[]; velocity: number } | null = null;
  private lastValue: number | null = null; // the strip position, kept across chords
  private ringing = new Map<number, number>(); // note → token of the timer that ends it
  private nextToken = 0;

  constructor(
    private out: NoteSink,
    private active: () => boolean, // true while the mod strip function is Strum
    private after: (seconds: number, fn: () => void) => void,
  ) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'chordOn':
      case 'chordChange': {
        const voicing = this.voicer.next(e.chord);
        this.chord = { notes: strumNotes(e.chord, voicing[0]), velocity: e.velocity };
        break;
      }
      case 'chordOff':
        this.chord = null;
        break;
      case 'mod':
        this.strum(e.value);
        break;
      case 'panic':
        this.allNotesOff();
        break;
    }
  }

  allNotesOff(): void {
    this.ringing.clear(); // pending timers find no token and do nothing
    this.out.allNotesOff();
    this.chord = null;
    this.voicer.reset();
  }

  private strum(value: number): void {
    const prev = this.lastValue;
    this.lastValue = value;
    if (!this.active() || !this.chord) return;
    const n = this.chord.notes.length;
    const to = zoneOf(value, n);
    const zones = prev === null ? [to] : crossed(zoneOf(prev, n), to);
    for (const z of zones) this.pluck(this.chord.notes[z], this.chord.velocity);
  }

  private pluck(note: number, velocity: number): void {
    const token = ++this.nextToken;
    this.ringing.set(note, token);
    this.out.noteOn(note, velocity); // a sink restarts a note that is still sounding
    this.after(STRUM_RELEASE_S, () => {
      if (this.ringing.get(note) !== token) return; // re-struck (or panic) since then
      this.ringing.delete(note);
      this.out.noteOff(note);
    });
  }
}
