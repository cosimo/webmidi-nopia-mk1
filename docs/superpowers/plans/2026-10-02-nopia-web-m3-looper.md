# Nopia Web — Milestone 3 (Looper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the looper: three clip slots (Verse, Chorus, Bridge) that record what is played (chords, melody, strum input, knob moves) and replay it through the modules, with record, play, overdub, clear and queued slot switching. At the end it is playable from the Komplete Kontrol M32.

**Architecture:** Builds on milestones 1–2 (on `main`). The looper (`src/modules/looper.ts`) is pure TypeScript and subscribes to the bus. It records live events against the grid clock, using fractional tick positions and the audio clock between ticks, and replays them as bus events stamped with their AudioContext time and `source: 'loop'`. Modules play stamped events at that time, and sinks guarantee a note never ends before it starts. Recordable parameter changes become `param` bus events, emitted from store changes. A header strip drives the looper, and its buttons are learnable.

**Tech Stack:** TypeScript 7, Vite 8, Tone.js 15, Vitest 5, Playwright 1.63. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-01-nopia-web-design.md` (milestone 3 = spec §2 item 3: §4.3, §5.7, §6, §7, §9). Earlier plans: `docs/superpowers/plans/2026-10-02-nopia-web-m1-core.md`, `…-m2-rhythm.md`.

## Global Constraints

- Target browsers: desktop Chrome/Edge (Web MIDI). Dev server in WSL2 on `127.0.0.1:5173` (`strictPort`), opened from Windows at `http://localhost:5173`.
- `src/harmony/`, `src/core/` (including the new `params.ts`), `src/modules/` (including the new `looper.ts`), `src/input/controlMap.ts`, `src/input/inputRouter.ts`, `src/sound/midiOutSink.ts`, `src/sound/moduleOutputs.ts`, `src/sound/monoNotes.ts` and the new `src/sound/noteStarts.ts` must not touch browser APIs or import Tone.js.
- Stack: TypeScript, Vite, Tone.js, Vitest, Playwright. No UI framework: plain DOM + CSS.
- Looper (§5.7), verbatim: "Records bus events, not audio: chord events as **table rows** (so loops follow later tonic/table/extension changes), melody notes as **offsets from the tonic** (so they transpose with the loop), strum input, and parameter changes."
- "Three slots: Verse, Chorus, Bridge. Slot states: empty, recording, playing, overdubbing, stopped. One slot plays at a time."
- "Record starts at the next bar; stopping rounds up to the end of the current bar; that sets the loop length in bars, and playback starts."
- "Overdub merges new events into the slot. Clear empties it."
- "Switching slots is queued to the end of the current loop."
- "Replayed events go back onto the bus, so they drive internal sounds and MIDI out exactly like live playing. A live control move overrides a recorded parameter until that parameter's next recorded event."
- Looper contents are not persisted (§6). The looper buttons are learnable (§4.3). The header carries the looper slot buttons (§7).
- Out of scope (§11): more than one chord sounding from the chord zone at once; saving loops across reloads.
- No stuck notes: panic, hiding the page, or losing the input stops every module's notes, internal and MIDI, including notes the looper has scheduled ahead.
- Commit after every task (the user wants small, logical commits). Follow the harness's commit-attribution rules.

## Decisions and Deviations from the Spec

Settled while planning. Each is small and reversible:

1. **Chords are stored as regions:** row, velocity, start, end and layer, in fractional grid ticks. On replay, the chord at a position comes from the newest layer that covers it. That is how overdub "merges": an overdubbed chord wins while it lasts, then the older chord resumes. A chord held across the loop's end is stored in two pieces with one id, so it doesn't retrigger at the seam.
2. **A live chord overrides the loop's chord while it is held,** and the loop's chord comes back when it is released. Only one chord sounds from the chord zone at a time (§11). Melody, strum and parameters mix rather than override; for parameters this is the spec's own rule.
3. **Melody transposition** shifts by the nearest interval (−6…+5 semitones) between the recording's tonic and the current one, so a melody stays in its register.
4. **Recorded parameters:** Extensions, the six module volumes, Tone, Reverb, Delay and Master. Tonic, tonality, layout and table are not recorded: the spec wants loops to follow later changes to them, and replaying recorded changes would undo the user's change every loop. Tempo is not recorded (the loop length is in bars), and neither are Arp settings or the mod strip function.
5. **Replay is scheduled.** Bus events gain optional `at` (AudioContext time) and `source: 'loop'`. Modules play `at` events at that time. Parameter moves apply when their tick is processed (up to Tone's `lookAhead`, ~0.1 s, early).
6. **Sinks never end a note before it starts** (`NoteStarts`). Once notes are scheduled ahead, an immediate note-off (panic, a live chord over the loop, a sink removed) could otherwise arrive before a queued note-on and leave the note hanging. This also settles milestone 2's deferred minor about `ToneSink.allNotesOff`.
7. **Positions between ticks:** live events get fractional grid positions from the audio clock, so a loop keeps its feel instead of snapping to 1/48 notes. Events up to one tick before the bar line count as on the bar. So does a chord already held when recording starts.
8. **Buttons:** Rec cycles empty → recording (from the next bar) → stop (at the bar's end, then playing) → overdub → playing. Rec pressed again before the bar line cancels. Rec on a stopped slot plays it with overdub from the next bar. Play toggles play/stop, and starting waits for the next bar. Selecting a stopped slot while another plays queues it for the end of the current loop. Recording a slot stops the playing one at its first bar.
9. **Panic stops the looper** (and so does hiding the page, which panics). Playing slots stop, and an unfinished recording is discarded. Otherwise the loop would sound again right after the panic.
10. **Learnable looper buttons:** `loopRec`, `loopPlay`, `loopClear`, `slotVerse`, `slotChorus`, `slotBridge`, all triggers. `ControlMap`'s trigger action becomes `trigger(target)`.
11. **Strum keeps separate strip positions** for live and replayed input, so the two never "cross" zones between each other.
12. **The looper subscribes to the bus after the panel.** When it re-sends the loop's chord on a live release, every listener has already seen the release.

## Review Focus

Failure modes the spec implies but does not spell out, most likely first. Each has a pinning test in the task that owns the code:

1. **A chord pressed just before the bar line, or still held when recording starts.** It must count from the bar. Test: Task 4 `records from the next bar and loops whole bars of chords, as table rows`.
2. **Keys still held when recording stops.** They must end with the loop on replay instead of hanging. Test: Task 4 `ends notes still held when recording stops at the loop end`.
3. **Playing live over a running loop.** The live chord wins, and the loop's chord returns on release. Test: Task 4 `a live chord overrides the loop's chord while held; the loop's chord comes back on release`.
4. **Panic, or hiding the page, while a loop plays.** The loop stops, and no replayed note scheduled ahead hangs, internally or over MIDI. Tests: Task 4 `panic stops playback and throws away an unfinished recording`; Task 1 `a note-off never overtakes its queued note-on`.
5. **Overdubbing a chord across the loop's end, or over an existing chord.** It continues without a retrigger at the seam, and the older chord resumes after it. Tests: Task 4 `an overdubbed chord held across the loop end continues without a retrigger` and `overdub merges: a newer chord wins while it lasts, then the older chord resumes`.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/sound/noteStarts.ts` | When each sounding note starts; never end a note before that |
| `src/sound/midiOutSink.ts`, `toneSink.ts` | Use `NoteStarts` |
| `src/core/bus.ts` | `at`/`source` on replayable events; `param` event |
| `src/core/params.ts` | Recordable parameters: keys, read/write, changes between settings |
| `src/modules/module.ts`, `melody.ts`, `strum.ts` | Play replayed events at their time; Strum keeps live/loop strip positions apart |
| `src/modules/looper.ts` | The looper |
| `src/core/store.ts`, `src/input/controlMap.ts` | Looper buttons as learnable triggers; parameters via `params.ts` |
| `src/ui/looperControls.ts`, `panel.ts`, `style.css` | Header slot buttons and Rec/Play/Clear |
| `src/main.ts` | Emits `param` events; wires the looper |
| `e2e/looper.spec.ts` | Browser tests for Task 6 |
| `docs/hardware-check-m3.md`, `README.md` | The user's milestone-3 checklist and play notes |

---

### Task 1: Sinks never end a note before it starts

**Files:**
- Create: `src/sound/noteStarts.ts`, `src/sound/noteStarts.test.ts`
- Modify: `src/sound/midiOutSink.ts`, `src/sound/toneSink.ts`
- Test: `src/sound/midiOutSink.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `class NoteStarts { constructor(gap: number); has(note): boolean; start(note, at?: number): void; end(note, at?: number): number | undefined; endAll(at?: number): [number, number | undefined][] }`.

- [ ] **Step 1: Write the failing tests** — `src/sound/noteStarts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NoteStarts } from './noteStarts';

describe('NoteStarts', () => {
  it('ends a note when asked, but never before it starts', () => {
    const notes = new NoteStarts(0.001);
    notes.start(60, 2);
    expect(notes.end(60, 1)).toBeCloseTo(2.001);
    notes.start(62, 2);
    expect(notes.end(62, 3)).toBe(3);
    notes.start(64, 2);
    expect(notes.end(64)).toBeCloseTo(2.001); // "now" for a note queued for later: just after it starts
    notes.start(65);
    expect(notes.end(65)).toBeUndefined(); // started now, ended now
    expect(notes.has(65)).toBe(false);
  });

  it('endAll ends and forgets every note', () => {
    const notes = new NoteStarts(1);
    notes.start(60);
    notes.start(64, 5000);
    expect(notes.endAll()).toEqual([[60, undefined], [64, 5001]]);
    expect(notes.has(60) || notes.has(64)).toBe(false);
  });
});
```

Append to `src/sound/midiOutSink.test.ts` inside the `describe`:

```ts
  it('a note-off never overtakes its queued note-on', () => {
    const sent: [number[], number | undefined][] = [];
    const sink = new MidiOutSink({ send: (d, t) => void sent.push([d, t]) }, 1, (at) => at * 1000);
    sink.noteOn(64, 100, 5); // queued in the port for 5000 ms
    sink.noteOff(64); // "now" would reach the synth first
    sink.noteOn(67, 100, 1);
    sink.noteOff(67, 2);
    expect(sent).toEqual([
      [[0x90, 64, 100], 5000],
      [[0x80, 64, 0], 5001],
      [[0x90, 67, 100], 1000],
      [[0x80, 67, 0], 2000],
    ]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/sound`
Expected: FAIL. `./noteStarts` can't be resolved, and the MIDI test gets `undefined` instead of `5001` for the untimed note-off.

- [ ] **Step 3: Implement** — `src/sound/noteStarts.ts`:

```ts
/** When each sounding note starts, so that no note is ended before it has started. */
export class NoteStarts {
  private starts = new Map<number, number | undefined>(); // undefined = started "now"

  /** `gap`: how soon after its start a note may end, in the caller's time unit. */
  constructor(private gap: number) {}

  has(note: number): boolean {
    return this.starts.has(note);
  }

  start(note: number, at?: number): void {
    this.starts.set(note, at);
  }

  /** Forgets `note` and returns when to end it: at `at` (undefined = now), but never before its start. */
  end(note: number, at?: number): number | undefined {
    const start = this.starts.get(note);
    this.starts.delete(note);
    if (start === undefined) return at;
    return at === undefined ? start + this.gap : Math.max(at, start + this.gap);
  }

  /** Ends and forgets every note; returns [note, end time] pairs as `end` computes them. */
  endAll(at?: number): [number, number | undefined][] {
    return [...this.starts.keys()].map((note) => [note, this.end(note, at)]);
  }
}
```

`src/sound/midiOutSink.ts` — replace the `sounding` map with `NoteStarts` (port timestamps are milliseconds, so the gap is 1 ms):

```ts
import type { NoteSink } from '../modules/module';
import { NoteStarts } from './noteStarts';
```

```ts
export class MidiOutSink implements NoteSink {
  private notes = new NoteStarts(1); // port timestamps (ms) of the sounding notes' note-ons
  private ch: number;
```

```ts
  noteOn(note: number, velocity: number, at?: number): void {
    const t = this.stamp(at);
    if (this.notes.has(note)) this.send([0x80 | this.ch, note, 0], this.notes.end(note, t));
    this.send([0x90 | this.ch, note, Math.min(127, Math.max(1, Math.round(velocity)))], t);
    this.notes.start(note, t);
  }

  noteOff(note: number, at?: number): void {
    if (!this.notes.has(note)) return;
    this.send([0x80 | this.ch, note, 0], this.notes.end(note, this.stamp(at)));
  }
```

```ts
  allNotesOff(): void {
    let last: number | undefined;
    for (const [note, t] of this.notes.endAll()) {
      this.send([0x80 | this.ch, note, 0], t);
      if (t !== undefined && (last === undefined || t > last)) last = t;
    }
    this.send([0xb0 | this.ch, 123, 0], last);
  }
```

`src/sound/toneSink.ts` — the same rule for the internal synth:

```ts
import * as Tone from 'tone';
import type { InternalSink } from './moduleOutputs';
import { NoteStarts } from './noteStarts';
import type { Voice } from './presets';

const DISPOSE_AFTER_MS = 4000; // let release tails finish before disposing
const END_GAP = 0.001; // s: the earliest a note may end after it starts
```

```ts
  private notes = new NoteStarts(END_GAP);
```

(replacing `private sounding = new Set<number>();`), and:

```ts
  noteOn(note: number, velocity: number, at?: number): void {
    const t = at ?? Tone.immediate();
    if (this.notes.has(note)) this.voice.release(note, this.notes.end(note, t)!);
    this.voice.attack(note, velocity / 127, t);
    this.notes.start(note, t);
  }

  noteOff(note: number, at?: number): void {
    if (!this.notes.has(note)) return;
    this.voice.release(note, this.notes.end(note, at ?? Tone.immediate())!);
  }
```

```ts
  allNotesOff(): void {
    // a release before a queued attack would leave that note sounding: release after the last start
    const now = Tone.immediate();
    this.voice.releaseAll(Math.max(now, ...this.notes.endAll(now).map(([, t]) => t!)));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS (the existing MIDI sink tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/sound/noteStarts.ts src/sound/noteStarts.test.ts src/sound/midiOutSink.ts src/sound/midiOutSink.test.ts src/sound/toneSink.ts
git commit -m "Never end a note before it starts, in MIDI and the internal synth"
```

---

### Task 2: Replayed events play at their time (§5.7)

**Files:**
- Modify: `src/core/bus.ts`, `src/modules/module.ts:32-52`, `src/modules/melody.ts`, `src/modules/strum.ts`
- Test: `src/modules/modules.test.ts`, `src/modules/strum.test.ts`

**Interfaces:**
- Consumes: `NoteSink` with `at` (milestone 2).
- Produces: `chordOn`, `chordChange`, `chordOff`, `melodyOn`, `melodyOff` and `mod` bus events accept `at?: number` (AudioContext time) and `source?: 'loop'`. Live events have neither.

- [ ] **Step 1: Write the failing tests** — in `src/modules/modules.test.ts`, inside `describe('KeysModule', …)`:

```ts
  it('plays replayed chords at their time', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90, at: 2, source: 'loop' });
    send(keys, { type: 'chordOff', at: 3, source: 'loop' });
    expect(sink.take()).toEqual(['on 60 90 @2', 'on 64 90 @2', 'on 67 90 @2', 'off 60 @3', 'off 64 @3', 'off 67 @3']);
  });
```

inside `describe('MelodyModule', …)`:

```ts
  it('plays replayed notes at their time', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'melodyOn', note: 72, velocity: 80, at: 1.5, source: 'loop' });
    send(mel, { type: 'melodyOff', note: 72, at: 2, source: 'loop' });
    expect(sink.take()).toEqual(['on 72 80 @1.5', 'off 72 @2']);
  });
```

and in `src/modules/strum.test.ts`, inside `describe('StrumModule', …)`:

```ts
  it('keeps live and replayed strip positions apart, plucking replayed zones at their time', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0); // live: zone 0
    send({ type: 'mod', value: 127, at: 2, source: 'loop' }); // the loop's first value: only its own zone
    mod(20); // live again: from zone 0 to zone 1, not from the loop's zone 6
    expect(sink.take()).toEqual(['on 60 100', 'on 84 100 @2', 'on 64 100']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/modules`
Expected: FAIL. Notes come out without `@` times, and the live strum after the loop value plucks 79 76 … 64.

- [ ] **Step 3: Implement**

`src/core/bus.ts`:

```ts
import type { Chord } from '../harmony/theory';

/** Events the looper replays carry `at` (AudioContext time they sound) and `source: 'loop'`. */
type Replayable = { at?: number; source?: 'loop' };

export type BusEventBody =
  | ({ type: 'chordOn'; chord: Chord; velocity: number } & Replayable)
  | ({ type: 'chordChange'; chord: Chord; velocity: number; retrigger: boolean } & Replayable)
  | ({ type: 'chordOff' } & Replayable)
  | ({ type: 'melodyOn'; note: number; velocity: number } & Replayable)
  | ({ type: 'melodyOff'; note: number } & Replayable)
  | { type: 'pitchBend'; bend: number } // -1..1
  | ({ type: 'mod'; value: number } & Replayable) // CC1, 0..127
  | { type: 'sustain'; on: boolean }
  | { type: 'tick'; tick: number; at: number; dur: number } // grid tick: index from the start, AudioContext time (s), seconds per tick
  | { type: 'panic' };
```

(keep `BusEvent`, `Listener` and `Bus` as they are).

`src/modules/module.ts` — `ChordModule` passes the time through:

```ts
  handle(e: BusEvent): void {
    if (e.type === 'chordOn') this.play(this.voice(e.chord), e.velocity, true, e.at);
    else if (e.type === 'chordChange') this.play(this.voice(e.chord), e.velocity, e.retrigger, e.at);
    else if (e.type === 'chordOff') this.play([], 0, true, e.at);
    else if (e.type === 'panic') this.allNotesOff();
  }
```

```ts
  /** Retrigger restarts every note; otherwise common notes sustain. `at`: when (omitted = now). */
  private play(next: number[], velocity: number, retrigger: boolean, at?: number): void {
    const stop = retrigger ? this.notes : this.notes.filter((n) => !next.includes(n));
    const start = retrigger ? next : next.filter((n) => !this.notes.includes(n));
    for (const n of stop) this.out.noteOff(n, at);
    for (const n of start) this.out.noteOn(n, velocity, at);
    this.notes = next;
  }
```

`src/modules/melody.ts` — the two note cases:

```ts
      case 'melodyOn':
        this.sustained.delete(e.note);
        this.out.noteOn(e.note, e.velocity, e.at);
        break;
      case 'melodyOff':
        if (this.sustainOn) this.sustained.add(e.note);
        else this.out.noteOff(e.note, e.at);
        break;
```

`src/modules/strum.ts` — one strip position per source, and replayed plucks at their time:

```ts
  private lastValue: Record<'live' | 'loop', number | null> = { live: null, loop: null }; // strip positions, kept across chords
```

(replacing `private lastValue: number | null = null;`),

```ts
      case 'mod':
        this.strum(e.value, e.source ?? 'live', e.at);
        break;
```

```ts
  private strum(value: number, source: 'live' | 'loop', at?: number): void {
    const prev = this.lastValue[source];
    this.lastValue[source] = value;
    if (!this.active() || !this.chord) return;
    const n = this.chord.notes.length;
    const to = zoneOf(value, n);
    const zones = prev === null ? [to] : crossed(zoneOf(prev, n), to);
    for (const z of zones) this.pluck(this.chord.notes[z], this.chord.velocity, at);
  }

  private pluck(note: number, velocity: number, at?: number): void {
    const token = ++this.nextToken;
    this.ringing.set(note, token);
    this.out.noteOn(note, velocity, at); // a sink restarts a note that is still sounding
```

(the rest of `pluck` unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/bus.ts src/modules/module.ts src/modules/melody.ts src/modules/strum.ts src/modules/modules.test.ts src/modules/strum.test.ts
git commit -m "Play replayed chords, notes and strum input at their scheduled time"
```

---

### Task 3: Recordable parameters as bus events (§5.7, §6)

**Files:**
- Create: `src/core/params.ts`, `src/core/params.test.ts`
- Modify: `src/core/bus.ts`, `src/input/controlMap.ts` (`getUnit`/`setUnit`), `src/main.ts` (store subscriber)

**Interfaces:**
- Consumes: `Settings`, `MODULE_IDS`, `ModuleId` (`src/core/store.ts`).
- Produces: `type ParamKey = 'extLevel' | \`vol.${ModuleId}\` | 'tone' | 'reverb' | 'delay' | 'master'`; `PARAM_KEYS`; `interface Param { key: ParamKey; value: number }`; `readParam(s, key): number`; `writeParam(s, p): void`; `paramChanges(prev, next): Param[]`. Bus: `{ type: 'param'; key: ParamKey; value: number }`, emitted by `main.ts` for every recordable change.

- [ ] **Step 1: Write the failing test** — `src/core/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PARAM_KEYS, paramChanges, readParam, writeParam } from './params';
import { defaultSettings } from './store';

describe('recordable parameters', () => {
  it('are Extensions, the six module volumes and the master section, not the harmonic frame', () => {
    expect(PARAM_KEYS).toEqual([
      'extLevel', 'vol.keys', 'vol.pad', 'vol.bass', 'vol.melody', 'vol.arp', 'vol.strum',
      'tone', 'reverb', 'delay', 'master',
    ]);
  });

  it('reads and writes each one', () => {
    const s = defaultSettings();
    const value = (i: number) => (i === 0 ? 3 : i / 20);
    PARAM_KEYS.forEach((key, i) => writeParam(s, { key, value: value(i) }));
    expect(PARAM_KEYS.map((k) => readParam(s, k))).toEqual(PARAM_KEYS.map((_, i) => value(i)));
    expect([s.extLevel, s.modules.pad.volume, s.master.volume]).toEqual([3, 0.1, 0.5]);
  });

  it('lists the parameters that changed, ignoring everything else', () => {
    const prev = defaultSettings();
    const next = structuredClone(prev);
    next.tonic = 5;
    next.master.reverb = 0.5;
    next.modules.bass.volume = 0.1;
    expect(paramChanges(prev, next)).toEqual([
      { key: 'vol.bass', value: 0.1 },
      { key: 'reverb', value: 0.5 },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/params.test.ts`
Expected: FAIL — `Cannot find module './params'`.

- [ ] **Step 3: Implement** — `src/core/params.ts`:

```ts
import type { ExtLevel } from '../harmony/theory';
import { MODULE_IDS, type ModuleId, type Settings } from './store';

/**
 * Settings the looper records and replays (spec §5.7). Tonic, tonality, layout and table are left
 * out so that loops follow later changes to them; tempo is left out because loops are in bars.
 */
export type ParamKey = 'extLevel' | `vol.${ModuleId}` | 'tone' | 'reverb' | 'delay' | 'master';

export const PARAM_KEYS: ParamKey[] = [
  'extLevel',
  ...MODULE_IDS.map((id) => `vol.${id}` as const),
  'tone', 'reverb', 'delay', 'master',
];

export interface Param {
  key: ParamKey;
  value: number;
}

export function readParam(s: Settings, key: ParamKey): number {
  if (key === 'extLevel') return s.extLevel;
  if (key === 'master') return s.master.volume;
  if (key.startsWith('vol.')) return s.modules[key.slice(4) as ModuleId].volume;
  return s.master[key as 'tone' | 'reverb' | 'delay'];
}

export function writeParam(s: Settings, { key, value }: Param): void {
  if (key === 'extLevel') s.extLevel = value as ExtLevel;
  else if (key === 'master') s.master.volume = value;
  else if (key.startsWith('vol.')) s.modules[key.slice(4) as ModuleId].volume = value;
  else s.master[key as 'tone' | 'reverb' | 'delay'] = value;
}

/** The recordable parameters whose values differ between two settings. */
export function paramChanges(prev: Settings, next: Settings): Param[] {
  return PARAM_KEYS.filter((key) => readParam(prev, key) !== readParam(next, key)).map((key) => ({
    key,
    value: readParam(next, key),
  }));
}
```

`src/core/bus.ts` — add `import type { ParamKey } from './params';` and the event, before `panic`:

```ts
  | { type: 'param'; key: ParamKey; value: number } // a recordable setting changed (live or replayed)
```

`src/input/controlMap.ts` — the continuous targets other than Tempo are parameters, so use `params.ts` instead of a second copy of the same paths:

```ts
import { readParam, writeParam, type ParamKey } from '../core/params';
```

```ts
function getUnit(s: Settings, target: ControlTarget): number {
  return target === 'tempo' ? (s.tempo - TEMPO_MIN) / TEMPO_SPAN : readParam(s, target as ParamKey);
}

function setUnit(s: Settings, target: ControlTarget, v: number): void {
  if (target === 'tempo') s.tempo = clampTempo(TEMPO_MIN + v * TEMPO_SPAN);
  else writeParam(s, { key: target as ParamKey, value: v });
}
```

(and drop `ModuleId` from the store import if it is now unused).

`src/main.ts` — import `paramChanges` from `./core/params`, and emit at the end of the existing `store.subscribe` callback:

```ts
  for (const p of paramChanges(prev, next)) bus.emit({ type: 'param', ...p });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS, including the unchanged control-map tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/params.ts src/core/params.test.ts src/core/bus.ts src/input/controlMap.ts src/main.ts
git commit -m "Announce recordable parameter changes on the bus"
```

---

### Task 4: The looper (§5.7)

**Files:**
- Create: `src/modules/looper.ts`
- Test: `src/modules/looper.test.ts`

**Interfaces:**
- Consumes: bus events incl. `tick`, `param`, `at`/`source` (Tasks 2–3); `Param` (Task 3); `chordForRow` (`src/harmony/chordEngine.ts`); `TICKS_PER_BAR` (`src/core/clock.ts`); `pc`, `HarmonySettings` (`src/harmony/theory.ts`).
- Produces: `type SlotId = 'verse' | 'chorus' | 'bridge'`; `SLOT_IDS`; `type SlotState = 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped'`; `interface SlotView { id; state; bars: number; waiting: boolean }`; `interface LooperView { selected: SlotId; slots: SlotView[]; bar: number | null }`; `interface LooperDeps { settings(): HarmonySettings; emit(e: BusEventBody): void; applyParam(p: Param): void; now(): number }`; `class Looper { constructor(deps); handle(e: BusEvent); select(id: SlotId); record(); play(); clear(); settingsChanged(); view(): LooperView; onChange(listener: () => void) }`.

- [ ] **Step 1: Write the failing test** — `src/modules/looper.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import type { Param } from '../core/params';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { Looper, type SlotId } from './looper';

const DUR = 0.125; // seconds per grid tick in these tests: a 48-tick bar lasts 6 s

let settings: HarmonySettings;
let out: BusEventBody[];
let applied: Param[];
let now: number;
let lastTick: number;
let looper: Looper;

const chord = (key: number) => chordForKey(key, settings);
const send = (body: BusEventBody) => looper.handle({ ...body, time: 0 } as BusEvent);
const slot = (id: SlotId) => looper.view().slots.find((s) => s.id === id)!;

/** Runs grid ticks up to and including `to`; the audio clock follows them. */
function runTo(to: number) {
  for (let k = lastTick + 1; k <= to; k++) {
    now = k * DUR;
    send({ type: 'tick', tick: k, at: k * DUR, dur: DUR });
  }
  lastTick = to;
}

/** Moves the audio clock to grid position `pos`, for the live event that follows. */
const at = (pos: number) => void (now = pos * DUR);

/** What the looper put on the bus since the last call; times are in grid ticks. */
function take(): string[] {
  const lines = out.map((e) => {
    const when = 'at' in e && e.at !== undefined ? ` @${e.at / DUR}` : '';
    switch (e.type) {
      case 'chordOn':
      case 'chordChange':
        return `${e.type} ${e.chord.name}${when}`;
      case 'melodyOn':
      case 'melodyOff':
        return `${e.type} ${e.note}${when}`;
      case 'mod':
        return `mod ${e.value}${when}`;
      default:
        return `${e.type}${when}`;
    }
  });
  out = [];
  return lines;
}

/** Records one bar from tick 48: `during` runs at tick 50; playback starts at tick 96. */
function recordBar(during: () => void) {
  runTo(1);
  looper.record();
  runTo(50);
  during();
  runTo(60);
  looper.record();
  runTo(95);
  out = [];
}

beforeEach(() => {
  settings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
  out = [];
  applied = [];
  now = 0;
  lastTick = -1;
  looper = new Looper({
    settings: () => settings,
    emit: (e) => void out.push(e),
    applyParam: (p) => {
      applied.push(p);
      send({ type: 'param', ...p }); // as in the app: the store change comes back as a param event
    },
    now: () => now,
  });
});

describe('Looper: recording and playback', () => {
  it('records from the next bar and loops whole bars of chords, as table rows', () => {
    runTo(3);
    looper.record();
    expect(slot('verse')).toEqual({ id: 'verse', state: 'recording', bars: 0, waiting: true });
    at(10);
    send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // before the bar, still held at it
    runTo(60);
    at(60.5);
    send({ type: 'chordChange', chord: chord(5), velocity: 80, retrigger: true }); // F
    runTo(70);
    at(70.5);
    send({ type: 'chordOff' });
    runTo(80);
    looper.record(); // stop: rounds up to the end of the bar
    expect(slot('verse').waiting).toBe(true);
    runTo(95);
    expect(take()).toEqual([]); // nothing replays while recording
    runTo(143);
    expect(take()).toEqual(['chordOn C @96', 'chordChange F @108.5', 'chordOff @118.5']);
    expect(slot('verse')).toEqual({ id: 'verse', state: 'playing', bars: 1, waiting: false });
  });

  it('replays chords under the current settings: tonic and extension changes carry over', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 });
      at(70);
      send({ type: 'chordOff' });
    });
    settings = { ...settings, tonic: 2, extLevel: 1 }; // D major, sevenths
    runTo(96);
    expect(take()).toEqual(['chordOn Dmaj7 @96']);
    settings = { ...settings, extLevel: 2 };
    looper.settingsChanged();
    expect(take()).toEqual(['chordChange Dmaj9']);
  });

  it('transposes melody notes with the tonic, to the nearest register', () => {
    recordBar(() => {
      at(53);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(60);
      send({ type: 'melodyOff', note: 72 });
    });
    settings = { ...settings, tonic: 11 }; // B: a semitone down is nearer than eleven up
    runTo(143);
    expect(take()).toEqual(['melodyOn 71 @101', 'melodyOff 71 @108']);
  });

  it('ends notes still held when recording stops at the loop end', () => {
    recordBar(() => {
      at(48);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
    });
    runTo(144);
    expect(take()).toEqual(['melodyOn 72 @96', 'melodyOff 72 @144', 'melodyOn 72 @144']);
  });

  it('records melody notes released under the sustain pedal until the pedal lifts', () => {
    recordBar(() => {
      at(50);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(51);
      send({ type: 'sustain', on: true });
      at(52);
      send({ type: 'melodyOff', note: 72 });
      at(56);
      send({ type: 'sustain', on: false });
    });
    runTo(143);
    expect(take()).toEqual(['melodyOn 72 @98', 'melodyOff 72 @104']);
  });

  it('ends a note shorter than a tick', () => {
    recordBar(() => {
      at(50.25);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(50.75);
      send({ type: 'melodyOff', note: 72 });
    });
    runTo(143);
    expect(take()).toEqual(['melodyOn 72 @98.25', 'melodyOff 72 @98.75']);
  });

  it('a live chord overrides the loop\'s chord while held; the loop\'s chord comes back on release', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // still held when playback starts
    });
    runTo(96);
    expect(take()).toEqual([]); // the live C is still held
    at(96.5);
    send({ type: 'chordOff' });
    expect(take()).toEqual(['chordOn C']);
    at(100);
    send({ type: 'chordOn', chord: chord(7), velocity: 90 }); // live G over the loop
    runTo(143);
    expect(take()).toEqual([]);
    at(143.5);
    send({ type: 'chordOff' });
    expect(take()).toEqual(['chordOn C']);
  });

  it('replays strum input and parameter moves, without recording its own replays', () => {
    recordBar(() => {
      at(50);
      send({ type: 'mod', value: 0 });
      at(51);
      send({ type: 'mod', value: 127 });
      at(52.5);
      send({ type: 'param', key: 'extLevel', value: 2 });
    });
    runTo(143);
    expect(take()).toEqual(['mod 0 @98', 'mod 127 @99']);
    expect(applied).toEqual([{ key: 'extLevel', value: 2 }]);
    looper.record(); // overdub through two more loops
    runTo(239);
    expect(applied).toHaveLength(3);
    expect(take().filter((l) => l.startsWith('mod'))).toHaveLength(4);
  });

  it('pressing Rec again before the bar cancels the recording', () => {
    runTo(1);
    looper.record();
    looper.record();
    runTo(100);
    expect(slot('verse').state).toBe('empty');
  });
});

describe('Looper: overdub, slots and control', () => {
  /** Verse: C held over the whole bar, playing from tick 96. */
  function verseOfC() {
    runTo(1);
    looper.record();
    runTo(48);
    at(48);
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    runTo(60);
    looper.record();
    runTo(95);
    at(96);
    send({ type: 'chordOff' }); // released as the loop ends: C covers the whole bar
  }

  it('overdub merges: a newer chord wins while it lasts, then the older chord resumes', () => {
    verseOfC();
    runTo(100);
    expect(take()).toEqual(['chordOn C @96']);
    looper.record(); // overdub
    expect(slot('verse').state).toBe('overdubbing');
    runTo(110);
    at(110);
    send({ type: 'chordOn', chord: chord(5), velocity: 90 }); // F
    runTo(120);
    at(120);
    send({ type: 'chordOff' });
    looper.record(); // back to playing
    expect(take()).toEqual(['chordOn C']);
    runTo(191);
    expect(take()).toEqual(['chordChange F @158', 'chordChange C @168']);
  });

  it('an overdubbed chord held across the loop end continues without a retrigger', () => {
    runTo(1);
    looper.record();
    runTo(60);
    looper.record(); // an empty bar, playing from 96
    runTo(100);
    looper.record(); // overdub
    runTo(136);
    at(136);
    send({ type: 'chordOn', chord: chord(7), velocity: 90 }); // G from position 40 …
    runTo(154);
    at(154);
    send({ type: 'chordOff' }); // … to position 10 of the next pass
    looper.record();
    out = [];
    runTo(250);
    expect(take()).toEqual(['chordOn G @184', 'chordOff @202', 'chordOn G @232', 'chordOff @250']);
  });

  it('plays one slot at a time; switching waits for the end of the current loop', () => {
    verseOfC();
    runTo(100);
    looper.select('chorus');
    looper.record(); // the chorus records from bar 144; the verse stops there
    runTo(143);
    expect(slot('verse').state).toBe('playing');
    runTo(144);
    expect(slot('verse').state).toBe('stopped');
    at(144);
    send({ type: 'chordOn', chord: chord(5), velocity: 90 });
    runTo(150);
    looper.record();
    runTo(191);
    at(192);
    send({ type: 'chordOff' });
    runTo(192); // the chorus plays F from 192
    out = [];
    looper.select('verse'); // queued for the end of the chorus's loop
    expect(slot('verse').waiting).toBe(true);
    runTo(239);
    expect(take()).toEqual([]);
    runTo(240);
    expect(take()).toEqual(['chordOff @240', 'chordOn C @240']);
    expect([slot('verse').state, slot('chorus').state]).toEqual(['playing', 'stopped']);
  });

  it('stop silences the loop; play starts it again at the next bar', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 });
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(70);
      send({ type: 'chordOff' });
      at(80);
      send({ type: 'melodyOff', note: 72 });
    });
    runTo(100);
    expect(take()).toEqual(['chordOn C @96', 'melodyOn 72 @96']);
    looper.play(); // stop
    expect(take()).toEqual(['chordOff', 'melodyOff 72']);
    expect(slot('verse').state).toBe('stopped');
    looper.play(); // from the next bar
    expect(slot('verse')).toEqual({ id: 'verse', state: 'playing', bars: 1, waiting: true });
    runTo(143);
    expect(take()).toEqual([]);
    runTo(144);
    expect(take()).toEqual(['chordOn C @144', 'melodyOn 72 @144']);
  });

  it('clear empties the selected slot and stops it', () => {
    verseOfC();
    runTo(100);
    out = [];
    looper.clear();
    expect(take()).toEqual(['chordOff']);
    expect(slot('verse')).toEqual({ id: 'verse', state: 'empty', bars: 0, waiting: false });
    runTo(200);
    expect(take()).toEqual([]);
  });

  it('panic stops playback and throws away an unfinished recording', () => {
    verseOfC();
    runTo(100);
    looper.select('chorus');
    looper.record(); // waiting for bar 144
    out = [];
    send({ type: 'panic' });
    expect(take()).toEqual([]); // the modules silence themselves on panic
    expect([slot('verse').state, slot('chorus').state]).toEqual(['stopped', 'empty']);
    runTo(200);
    expect(take()).toEqual([]);
  });

  it('reports slot states, lengths and the playing bar, and announces changes', () => {
    let changes = 0;
    looper.onChange(() => changes++);
    runTo(1);
    looper.record();
    runTo(100);
    looper.record(); // 52 ticks in: rounds up to two bars
    runTo(144);
    expect(looper.view()).toEqual({
      selected: 'verse',
      bar: 1,
      slots: [
        { id: 'verse', state: 'playing', bars: 2, waiting: false },
        { id: 'chorus', state: 'empty', bars: 0, waiting: false },
        { id: 'bridge', state: 'empty', bars: 0, waiting: false },
      ],
    });
    const before = changes;
    runTo(192);
    expect(looper.view().bar).toBe(2);
    expect(changes).toBeGreaterThan(before);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/looper.test.ts`
Expected: FAIL — `Cannot find module './looper'`.

- [ ] **Step 3: Implement** — `src/modules/looper.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/modules/looper.test.ts && npm run typecheck`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/looper.ts src/modules/looper.test.ts
git commit -m "Add the looper: three slots that record and replay chords, melody, strum and knob moves"
```

---

### Task 5: Learnable looper buttons (§4.3)

**Files:**
- Modify: `src/core/store.ts` (`ControlTarget`, `CONTROL_TARGETS`), `src/input/controlMap.ts`, `src/main.ts`
- Test: `src/input/controlMap.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ControlTarget` gains `'loopRec' | 'loopPlay' | 'loopClear' | 'slotVerse' | 'slotChorus' | 'slotBridge'` (kind `trigger`). `new ControlMap(store, { trigger(target: ControlTarget): void })` replaces `{ panic(): void }`.

- [ ] **Step 1: Write the failing tests** — in `src/input/controlMap.test.ts`, replace the setup and the panic test:

```ts
let store: Store;
let triggered: string[];
let map: ControlMap;

beforeEach(() => {
  store = new Store(null);
  triggered = [];
  map = new ControlMap(store, { trigger: (t) => void triggered.push(t) });
});
```

```ts
  it('fires panic on press', () => {
    map.arm('panic');
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 0);
    expect(triggered).toEqual(['panic']);
  });

  it('fires the looper buttons on press', () => {
    for (const [cc, target] of [[34, 'loopRec'], [35, 'slotChorus']] as const) {
      map.arm(target);
      map.handleCC(1, cc, 0);
      map.handleCC(1, cc, 127);
    }
    expect(triggered).toEqual(['loopRec', 'slotChorus']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/input/controlMap.test.ts`
Expected: FAIL: `this.actions.panic is not a function` when panic fires, and no looper targets exist.

- [ ] **Step 3: Implement**

`src/core/store.ts`:

```ts
  | 'arpRate'
  | 'loopRec'
  | 'loopPlay'
  | 'loopClear'
  | 'slotVerse'
  | 'slotChorus'
  | 'slotBridge'
  | 'panic';
```

```ts
  'tone', 'reverb', 'delay', 'master', 'tempo', 'arpRate',
  'loopRec', 'loopPlay', 'loopClear', 'slotVerse', 'slotChorus', 'slotBridge', 'panic',
```

`src/input/controlMap.ts` — new `TARGET_INFO` entries after `arpRate`:

```ts
  loopRec: { label: 'Looper record', kind: 'trigger' },
  loopPlay: { label: 'Looper play/stop', kind: 'trigger' },
  loopClear: { label: 'Looper clear', kind: 'trigger' },
  slotVerse: { label: 'Verse slot', kind: 'trigger' },
  slotChorus: { label: 'Chorus slot', kind: 'trigger' },
  slotBridge: { label: 'Bridge slot', kind: 'trigger' },
```

the constructor:

```ts
  constructor(
    private store: Store,
    private actions: { trigger(target: ControlTarget): void }, // buttons: panic, looper
  ) {}
```

and in `apply`:

```ts
    if (kind === 'trigger') {
      if (value > 63) this.actions.trigger(target);
      return;
    }
```

`src/main.ts` — the controls fire panic through the new action (Task 6 adds the looper buttons):

```ts
const controls = new ControlMap(store, { trigger: (t) => t === 'panic' && panic() });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/input/controlMap.ts src/input/controlMap.test.ts src/main.ts
git commit -m "Make the looper buttons learnable"
```

---

### Task 6: The looper in the app (§5.7, §7)

**Files:**
- Create: `src/ui/looperControls.ts`, `e2e/looper.spec.ts`
- Modify: `src/ui/panel.ts`, `src/ui/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: `Looper`, `SLOT_IDS`, `SlotId`, `SlotState` (Task 4); `writeParam` (Task 3); `ControlMap` triggers (Task 5); e2e helpers from `e2e/fakeMidi.ts`.
- Produces: `createLooperControls(looper: Looper): { el: HTMLElement }`, with test ids `slot-verse|chorus|bridge` (attribute `data-state`, class `selected` and `waiting`), `loop-rec`, `loop-play` and `loop-clear`, each with a `data-learn` target. `PanelDeps.looper: Looper`.

- [ ] **Step 1: Write the failing browser tests** — `e2e/looper.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, midiSent, sendMidi, start, SYNTH, withFakeMidi } from './fakeMidi';

/** Note numbers of the Keys module's note-ons (MIDI channel 1), in order. */
async function keysNotes(page: Page): Promise<number[]> {
  return (await midiSent(page)).filter((m) => m.data[0] === 0x90 && m.data[2] > 0).map((m) => m.data[1]);
}

/** Records one bar holding C for a moment, and waits until the loop plays. */
async function recordBarOfC(page: Page) {
  const verse = page.getByTestId('slot-verse');
  await page.getByTestId('loop-rec').click();
  await expect(verse).toHaveAttribute('data-state', 'recording');
  await expect(verse).not.toHaveClass(/waiting/, { timeout: 3000 }); // recording starts on the next bar
  await sendMidi(page, [0x90, 48, 100]); // C
  await page.waitForTimeout(300);
  await sendMidi(page, [0x80, 48, 0]);
  await page.getByTestId('loop-rec').click(); // stops at the end of this bar, then plays
  await expect(verse).toHaveAttribute('data-state', 'playing', { timeout: 3000 });
}

test.describe('looper', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
    const tempo = page.getByTestId('tempo');
    await tempo.fill('240'); // one bar per second
    await tempo.blur();
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('records a bar of chords and plays it back over MIDI', async ({ page }) => {
    await recordBarOfC(page);
    await expect(page.getByTestId('slot-verse')).toHaveClass(/selected/);
    // played live once, then replayed every second
    await expect.poll(async () => (await keysNotes(page)).filter((n) => n === 60).length, { timeout: 5000 })
      .toBeGreaterThanOrEqual(3);
  });

  test('the loop follows a tonic change: chords are stored as table rows', async ({ page }) => {
    await recordBarOfC(page);
    await page.getByTestId('tonic-2').click(); // D major: the loop's I chord is now D, with F♯
    await expect.poll(async () => (await keysNotes(page)).filter((n) => n % 12 === 6).length, { timeout: 5000 })
      .toBeGreaterThan(0);
  });

  test('clear stops the loop', async ({ page }) => {
    await recordBarOfC(page);
    await page.getByTestId('loop-clear').click();
    await expect(page.getByTestId('slot-verse')).toHaveAttribute('data-state', 'empty');
    await page.waitForTimeout(300); // replayed steps already scheduled ahead may still go out
    const count = (await keysNotes(page)).length;
    await page.waitForTimeout(1500);
    expect((await keysNotes(page)).length).toBe(count);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run e2e -- e2e/looper.spec.ts`
Expected: FAIL — no `loop-rec` element.

- [ ] **Step 3: Implement**

`src/ui/looperControls.ts`:

```ts
import type { ControlTarget } from '../core/store';
import { SLOT_IDS, type Looper, type SlotId, type SlotState } from '../modules/looper';
import { h } from './dom';

const NAMES: Record<SlotId, string> = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge' };
const LEARN: Record<SlotId, ControlTarget> = { verse: 'slotVerse', chorus: 'slotChorus', bridge: 'slotBridge' };
const STATES: SlotState[] = ['empty', 'recording', 'playing', 'overdubbing', 'stopped'];

/** The looper's slot buttons and Rec / Play / Clear, in the header (spec §5.7, §7). */
export function createLooperControls(looper: Looper) {
  const slots = SLOT_IDS.map((id) =>
    h('button', { class: 'slot', 'data-testid': `slot-${id}`, 'data-learn': LEARN[id], onclick: () => looper.select(id) }),
  );
  const button = (label: string, id: string, learn: ControlTarget, action: () => void) =>
    h('button', { 'data-testid': id, 'data-learn': learn, onclick: action }, label);
  const el = h(
    'div',
    { class: 'looper' },
    ...slots,
    button('Rec', 'loop-rec', 'loopRec', () => looper.record()),
    button('Play', 'loop-play', 'loopPlay', () => looper.play()),
    button('Clear', 'loop-clear', 'loopClear', () => looper.clear()),
  );

  function render() {
    const view = looper.view();
    view.slots.forEach((s, i) => {
      const b = slots[i];
      for (const state of STATES) b.classList.toggle(state, state === s.state); // classList: keeps learn's 'armed'
      b.classList.toggle('selected', s.id === view.selected);
      b.classList.toggle('waiting', s.waiting);
      b.dataset.state = s.state;
      const playing = (s.state === 'playing' || s.state === 'overdubbing') && view.bar !== null;
      b.textContent = NAMES[s.id] + (s.bars ? ` ${playing ? `${view.bar}/` : ''}${s.bars}` : '');
    });
  }
  looper.onChange(render);
  render();
  return { el };
}
```

`src/ui/panel.ts` — the looper in `PanelDeps` and the header:

```ts
import type { Looper } from '../modules/looper';
```

```ts
import { createLooperControls } from './looperControls';
```

```ts
  startAudio: () => Promise<void>;
  looper: Looper;
}
```

```ts
    h('button', { 'data-testid': 'settings-toggle', onclick: () => settings.toggle() }, 'Settings'),
    createLooperControls(deps.looper).el,
    h('button', { class: 'panic', 'data-learn': 'panic', 'data-testid': 'panic', onclick: () => deps.panic() }, 'Panic'),
```

`src/ui/style.css` — append:

```css
.looper { display: flex; gap: 6px; align-items: center; }
.looper .slot { min-width: 84px; background: #a9b6bc; }
.looper .slot.selected { box-shadow: 0 0 0 2px var(--ink); }
.looper .slot.stopped { background: var(--button); }
.looper .slot.playing { background: #4f9a63; }
.looper .slot.recording, .looper .slot.overdubbing { background: #c9473a; }
.looper .slot.waiting { animation: blink 0.5s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0.45; } }
```

`src/main.ts` — create the looper, give the controls its buttons, keep its chord in step with the harmony settings, pass it to the panel, and subscribe it last. Imports:

```ts
import { paramChanges, writeParam } from './core/params';
import type { ControlTarget } from './core/store';
import { Looper } from './modules/looper';
```

(merge `writeParam` into the existing `./core/params` import, and `ControlTarget` into the existing `./core/store` import). After `const engine = …`:

```ts
const looper = new Looper({
  settings: () => store.get(),
  emit: (e) => bus.emit(e),
  applyParam: (p) => store.update((s) => writeParam(s, p)),
  now: () => Tone.immediate(),
});
```

Replace the `ControlMap` line:

```ts
const TRIGGERS: Partial<Record<ControlTarget, () => void>> = {
  panic,
  loopRec: () => looper.record(),
  loopPlay: () => looper.play(),
  loopClear: () => looper.clear(),
  slotVerse: () => looper.select('verse'),
  slotChorus: () => looper.select('chorus'),
  slotBridge: () => looper.select('bridge'),
};
const controls = new ControlMap(store, { trigger: (t) => TRIGGERS[t]?.() });
```

In the `store.subscribe` callback, the harmony line becomes:

```ts
  if (HARMONY_KEYS.some((k) => next[k] !== prev[k])) {
    engine.settingsChanged();
    looper.settingsChanged();
  }
```

Add `looper,` to the `mountPanel` deps, and right after the `mountPanel(…)` call:

```ts
// last: when the looper re-sends its chord on a live release, every listener has seen the release
bus.subscribe((e) => looper.handle(e));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test && npm run e2e && npm run build`
Expected: all PASS, 29 browser tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/looperControls.ts src/ui/panel.ts src/ui/style.css src/main.ts e2e/looper.spec.ts
git commit -m "Put the looper in the header and wire it to the bus, store and controls"
```

---

### Task 7: README and the milestone-3 hardware checklist (§9)

**Files:**
- Create: `docs/hardware-check-m3.md`
- Modify: `README.md` (Play section)

**Interfaces:** none.

- [ ] **Step 1: Write `docs/hardware-check-m3.md`:**

```markdown
# Hardware check — Milestone 3

Run this with the Komplete Kontrol M32 connected to Windows, as in
[the milestone-1 check](hardware-check-m1.md). Turn **Click** on: the looper works in bars.

## Record and play

- [ ] **Verse** is selected (outlined). Press **Rec**: the button blinks until the next bar, then
      records (red). Play four bars of chords and a melody. Press **Rec** again near the end of
      the fourth bar: it records to the end of that bar, then plays it back (green) and repeats.
- [ ] The loop sounds like what you played, on the internal sounds and on every module routed to
      the DAW (the DAW tracks receive it like live playing).
- [ ] Hold a chord over the loop: your chord replaces the loop's while you hold it; release it and
      the loop's chord comes back.
- [ ] Change the tonic (hold the top key and press a chord key): the loop plays in the new key, the
      melody too. Switch Major/Minor, Static, Borrowed, turn Extensions: the loop follows.

## Overdub, slots, clear

- [ ] While Verse plays, press **Rec**: overdub (red). Play a new chord over part of the loop and
      turn Extensions; press **Rec** again. The loop now has the new chord where you played it and
      the original chord around it; the Extensions move repeats every loop until you turn it again.
- [ ] Select **Chorus**, press **Rec**: Verse stops at the next bar and Chorus records. Finish it.
- [ ] While Chorus plays, select **Verse**: it blinks and starts when the Chorus loop ends.
- [ ] **Play** stops the selected slot; **Play** again starts it at the next bar.
- [ ] **Clear** empties the selected slot and silences it.
- [ ] **Panic** while a loop plays: everything stops and the loop does not come back.

## MIDI learn

- [ ] Learn mode: click **Rec**, press an M32 button (one that sends a CC in MIDI mode): the button
      now records. Learn **Play**, **Clear** and the three slots the same way.

## Record

- [ ] Whether loops sound in time with the click, and whether the first beat of a loop is late.
- [ ] Which M32 buttons send CCs in plain MIDI mode (for the looper bindings).
```

- [ ] **Step 2: Update `README.md`** — in the Play section, after the mod strip line, add:

```markdown
- The looper (header): **Verse**, **Chorus**, **Bridge** slots with **Rec** (record from the next
  bar; again to stop at the end of the bar and loop; again to overdub), **Play** (play/stop) and
  **Clear**. Selecting another slot while one plays switches at the end of the loop. Loops follow
  later key, mode and Extensions changes.
```

and replace the checklists line with:

```markdown
Hardware checklists: [milestone 1](docs/hardware-check-m1.md), [milestone 2](docs/hardware-check-m2.md),
[milestone 3](docs/hardware-check-m3.md).
```

- [ ] **Step 3: Commit**

```bash
git add docs/hardware-check-m3.md README.md
git commit -m "Document the looper and its hardware check"
```
