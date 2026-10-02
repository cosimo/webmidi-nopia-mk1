# Nopia Web — Milestone 2 (Rhythm) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add milestone 2 to the harmony instrument: a tempo clock with tap tempo and a metronome, the Arp module on the clock grid, and the Strum module played from the mod strip. Each sounds internally and/or goes to its own MIDI channel. At the end it is playable from the Komplete Kontrol M32.

**Architecture:** Builds on milestone 1 (merged on `main`). Tempo math and tap tempo live in pure `src/core/clock.ts`. A thin Tone.js adapter (`src/sound/transport.ts`) runs `Tone.Transport` and emits a `tick` bus event per grid tick, carrying the tick's AudioContext time. Sinks take an optional note time, so the Arp schedules its notes exactly: Tone gets the audio time, and Web MIDI gets a `performance.now()` timestamp. Arp and Strum are pure modules tested in Vitest. Playwright drives them through the fake Web MIDI.

**Tech Stack:** TypeScript 7, Vite 8, Tone.js 15, Vitest 5, Playwright 1.63. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-01-nopia-web-design.md` (milestone 2 = spec §2 item 2: §4.3, §5.1–5.6, §6, §7, §9). Milestone 1's plan, `docs/superpowers/plans/2026-10-02-nopia-web-m1-core.md`, explains the existing code.

## Global Constraints

- Target browsers: desktop Chrome/Edge (Web MIDI). Dev server in WSL2 on `127.0.0.1:5173` (`strictPort`), opened from Windows at `http://localhost:5173`.
- `src/harmony/`, `src/core/` (including the new `clock.ts`), `src/modules/` (including `arp.ts`, `strum.ts`), `src/input/controlMap.ts`, `src/input/inputRouter.ts`, `src/sound/midiOutSink.ts`, `src/sound/moduleOutputs.ts`, `src/sound/monoNotes.ts` must not touch browser APIs or import Tone.js.
- Stack: TypeScript, Vite, Tone.js, Vitest, Playwright. No UI framework: plain DOM + CSS.
- Clock (§5.4): Tone.Transport, 4/4, 40–240 BPM (default 100), tap tempo (mean of the last 4 taps), optional metronome click. Emits grid ticks on the bus.
- Arp (§5.5): source = the Keys voicing, extended over `octaves` (1–3). Patterns: up, down, up-down (ends not repeated), random. Rate: 1/4, 1/8, 1/8T, 1/16, 1/16T. Gate 10–100%. Steps fire on the transport grid. A chord change swaps the notes from the next step; the pattern index resets when a chord starts from silence. Silence when no chord is held.
- Strum (§5.6): the chord's pitch classes laid out upward over two octaves from the Keys voicing's lowest note, plus the top root: N notes. CC1 0–127 is divided into N equal zones. When the value moves into a new zone, every zone crossed triggers its note. Plucked envelope; MIDI note-offs follow after 1.5 s. No chord held → no strum notes.
- Mod strip (§4.3): CC1 → setting "Mod strip function": Vibrato (Melody vibrato depth) or Strum. Strum becomes the default in milestone 2.
- Learnable in milestone 2 (§4.3): Tempo, Arp rate, and the Arp and Strum volumes (the six module volumes).
- Modules (§5.2): Arp on MIDI channel 3 with presets Pluck, Bell; Strum on MIDI channel 6 with presets Harp, Pluck. Channels overall: Keys 1, Bass 2, Arp 3, Pad 4, Melody 5, Strum 6. MIDI out is off for every module until a port is chosen.
- Tone (low-pass) applies to Keys, Pad and Arp (§5.3).
- No stuck notes: panic, hiding the page, or losing the input stops every module's notes, internal and MIDI, including Arp steps already scheduled ahead and ringing Strum notes.
- Settings persist in localStorage under `nopia-web.settings.v2`. Invalid data, or data from an older version, falls back to the defaults (spec §6).
- Tone.js context keeps `latencyHint: 'interactive'` and its default `lookAhead`. Live notes start at `Tone.immediate()`.
- Commit after every task (the user wants small, logical commits). Follow the harness's commit-attribution rules.

## Decisions and Deviations from the Spec

Settled while planning. Each is small and reversible:

1. **Grid:** 12 ticks per quarter note (48 per bar), the smallest grid that fits all five Arp rates (1/4 = 12, 1/8 = 6, 1/8T = 4, 1/16 = 3, 1/16T = 2). The bus `tick` event is `{ tick, at, dur }`: tick index since the transport started, AudioContext time (s) when it sounds, and seconds per tick at the current tempo.
2. **Where the clock lives:** spec §10 puts `clock.ts` in `core/`, and the global rule keeps `core/` free of browser APIs. So `core/clock.ts` holds the tempo math and tap tempo, and the Tone.Transport adapter is `sound/transport.ts`.
3. **The transport always runs** once audio has started. The spec has no start/stop control, and milestone 3 counts bars from the transport's start.
4. **Timed notes:** `NoteSink.noteOn(note, velocity, at?)` and `noteOff(note, at?)` take an optional AudioContext time. This is the `time` that milestone 1 deferred (its decision 3). `MidiOutSink` turns it into a Web MIDI timestamp (`performance.now()` ms).
5. **Arp note-offs stay in the Arp until due.** They go out on the tick before they are due, stamped with their exact time. Neither Tone nor Web MIDI can cancel a scheduled event (Tone's `releaseAll` misses an attack scheduled in the future, and Chrome has no `MIDIOutput.clear()`). So on panic the Arp ends each pending step 1 ms after that step's own start, then calls `allNotesOff()`.
6. **First Arp step:** the first grid step after the chord. Ticks are processed Tone's `lookAhead` (0.1 s) early, so this is at least ~0.1 s after the key press. `lookAhead` stays at its default to avoid audio glitches.
7. **Arp is disabled by default.** Otherwise it would double every chord on first launch. Strum is enabled, because it only plays when the strip moves.
8. **Strum details:** the first strip value received triggers only its own zone. The strip position persists across chords. While the mod strip function is Vibrato, Strum plays nothing. Note-offs use a timer. Re-striking a ringing note restarts it, and its 1.5 s count starts over.
9. **Vibrato:** Melody forwards CC1 only while the mod strip function is Vibrato. Switching away resets vibrato to 0 once.
10. **Encoders:** Tempo, absolute, maps 0–127 onto 40–240 BPM. Relative, one tick is 1 BPM. Arp rate is a stepped target like Extensions: absolute values split 0–127 into 5 ranges, and in relative mode it moves one step per 8 ticks. Each stepped target counts its own ticks.
11. **Settings key `nopia-web.settings.v2`.** Milestone 1's v1 settings are ignored, as spec §6 says for older versions. The user redoes any milestone-1 settings once.
12. **Deferred to milestone 3:** the `param` bus event (only the looper uses it). Tempo is a whole number of BPM. Tap tempo starts over after a 2 s pause.
13. **Arp and Strum voicing:** each keeps its own `Voicer` that follows the same chords as Keys, so it voices identically. The Pad already works this way.

## Review Focus

Failure modes the spec implies but does not spell out, most likely first. Each has a pinning test in the task that owns the code:

1. **Panic or hiding the page while the Arp runs.** A step already scheduled ahead must not keep sounding, internally or over MIDI, and every Arp note-on gets its note-off. Tests: Task 5 `panic ends a step scheduled ahead at its own start time`; Task 7 `panic stops the Arp and leaves no note hanging`.
2. **Wiggling the mod strip across one zone boundary.** The same note is re-struck again and again. An older 1.5 s note-off must not cut the newer note short, and every note still ends. Test: Task 6 `re-striking a ringing note restarts its 1.5 s`.
3. **Gate 100% with a repeated note.** The previous note-off must go out before the next note-on at the same time, or the synth ends the new note. Test: Task 5 `at gate 100% a repeated note ends before it restarts`.
4. **Changing tempo while the Arp plays.** A note keeps the gate it started with, and none is left without a note-off. Test: Task 5 `keeps the gate a note started with when the tempo changes`.
5. **Switching the mod strip from Vibrato to Strum with vibrato up.** The Melody's vibrato must return to 0 on the internal synth and over MIDI. Test: Task 6 `resets vibrato when the mod strip switches away from Vibrato`.

---

## File Map

| Path | Responsibility |
|---|---|
| `src/core/clock.ts` | Grid constants, tempo range, `clampTempo()`, `tickSeconds()`, `TapTempo` |
| `src/core/bus.ts` | + `tick` event |
| `src/core/store.ts` | + tempo, metronome, mod strip function, Arp settings, Arp/Strum modules; key v2 |
| `src/input/controlMap.ts` | + Tempo, Arp rate, Arp/Strum volume targets; generic stepped targets |
| `src/modules/module.ts`, `testSink.ts` | `NoteSink` gains optional note times |
| `src/modules/arp.ts` | `arpNotes()`, `arpCycle()`, `ArpModule` |
| `src/modules/strum.ts` | `strumNotes()`, `StrumModule` |
| `src/modules/melody.ts` | CC1 only in Vibrato mode; `modStripChanged()` |
| `src/sound/midiOutSink.ts`, `moduleOutputs.ts`, `toneSink.ts` | Timed notes |
| `src/sound/audioTime.ts` | AudioContext time → Web MIDI timestamp |
| `src/sound/transport.ts` | Tone.Transport → grid ticks |
| `src/sound/metronome.ts` | Click on each beat |
| `src/sound/master.ts` | + `clickInput` (dry, straight to the limiter) |
| `src/sound/presets.ts` | + `bell`, `harp` |
| `src/ui/rhythm.ts` | Tempo knob and field, Tap, Click |
| `src/ui/arpSettings.ts` | Arp pattern, rate, octaves, gate |
| `src/ui/moduleStrip.ts`, `panel.ts`, `settings.ts`, `style.css` | Six modules, rhythm block, mod strip selector |
| `src/main.ts` | Wires the transport, metronome, Arp and Strum |
| `e2e/rhythm.spec.ts` | Browser tests for Tasks 7 and 8 |
| `docs/hardware-check-m2.md`, `README.md` | The user's milestone-2 checklist and play notes |

---

### Task 1: Clock core and the tick event (§5.4, §6)

**Files:**
- Create: `src/core/clock.ts`
- Test: `src/core/clock.test.ts`
- Modify: `src/core/bus.ts:3-12` (add the `tick` event)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PPQ = 12`, `TICKS_PER_BAR = 48`, `TEMPO_MIN = 40`, `TEMPO_MAX = 240`, `TEMPO_DEFAULT = 100`, `TAP_RESET_MS = 2000`, `clampTempo(bpm: number): number`, `tickSeconds(bpm: number): number`, `class TapTempo { tap(nowMs: number): number | null }`. Bus: `{ type: 'tick'; tick: number; at: number; dur: number }`.

- [ ] **Step 1: Write the failing test** — `src/core/clock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clampTempo, PPQ, TapTempo, tickSeconds, TICKS_PER_BAR } from './clock';

describe('clock grid', () => {
  it('uses 12 ticks per quarter note, 48 per 4/4 bar', () => {
    expect([PPQ, TICKS_PER_BAR]).toEqual([12, 48]);
    expect(tickSeconds(120)).toBeCloseTo(0.5 / 12);
  });

  it('rounds and clamps tempos to 40–240 BPM', () => {
    expect([clampTempo(10), clampTempo(99.6), clampTempo(500), clampTempo(Infinity)]).toEqual([40, 100, 240, 240]);
  });
});

describe('TapTempo', () => {
  it('reports a tempo from the second tap, averaging over the last 4 taps', () => {
    const taps = new TapTempo();
    expect(taps.tap(0)).toBeNull();
    expect(taps.tap(500)).toBe(120);
    expect(taps.tap(1000)).toBe(120);
    expect(taps.tap(1800)).toBe(100); // (1800 − 0) / 3 = 600 ms
    expect(taps.tap(2400)).toBe(95); // only the last 4: (2400 − 500) / 3 ≈ 633 ms
  });

  it('starts a new count after a pause longer than 2 s', () => {
    const taps = new TapTempo();
    taps.tap(0);
    taps.tap(500);
    expect(taps.tap(3000)).toBeNull();
    expect(taps.tap(3400)).toBe(150);
  });

  it('clamps very fast or very slow tapping', () => {
    const fast = new TapTempo();
    fast.tap(0);
    expect(fast.tap(100)).toBe(240);
    const slow = new TapTempo();
    slow.tap(0);
    expect(slow.tap(1990)).toBe(40);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/clock.test.ts`
Expected: FAIL — `Failed to resolve import "./clock"`.

- [ ] **Step 3: Implement** — `src/core/clock.ts`:

```ts
/** Grid ticks per quarter note: 1/4 = 12, 1/8 = 6, 1/8T = 4, 1/16 = 3, 1/16T = 2. */
export const PPQ = 12;
/** 4/4 time. */
export const TICKS_PER_BAR = 4 * PPQ;
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 240;
export const TEMPO_DEFAULT = 100;
/** Taps further apart than this start a new count. */
export const TAP_RESET_MS = 2000;

/** A whole number of BPM within 40–240. */
export function clampTempo(bpm: number): number {
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)));
}

/** Seconds per grid tick at `bpm`. */
export function tickSeconds(bpm: number): number {
  return 60 / bpm / PPQ;
}

/** Tap tempo (spec §5.4): the mean interval of the last 4 taps. */
export class TapTempo {
  private taps: number[] = [];

  /** Registers a tap at `nowMs`; returns the new tempo, or null until there are two taps. */
  tap(nowMs: number): number | null {
    const last = this.taps.at(-1);
    if (last !== undefined && nowMs - last > TAP_RESET_MS) this.taps = [];
    this.taps = [...this.taps, nowMs].slice(-4);
    if (this.taps.length < 2) return null;
    const mean = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return clampTempo(60000 / mean);
  }
}
```

In `src/core/bus.ts`, add the tick event to `BusEventBody` after the `sustain` line:

```ts
  | { type: 'sustain'; on: boolean }
  | { type: 'tick'; tick: number; at: number; dur: number } // grid tick: index from the start, AudioContext time (s), seconds per tick
  | { type: 'panic' };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/core/clock.test.ts && npm run typecheck`
Expected: PASS (6 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/clock.ts src/core/clock.test.ts src/core/bus.ts
git commit -m "Add tempo clock core: grid, tempo range and tap tempo"
```

---

### Task 2: Timed notes in the sinks (§5.1)

**Files:**
- Modify: `src/modules/module.ts:6-12`, `src/modules/testSink.ts`, `src/sound/midiOutSink.ts`, `src/sound/moduleOutputs.ts`, `src/sound/toneSink.ts:27-37`, `src/main.ts:38-42`
- Create: `src/sound/audioTime.ts`
- Test: `src/sound/midiOutSink.test.ts`, `src/sound/moduleOutputs.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `NoteSink.noteOn(note: number, velocity: number, at?: number)`, `NoteSink.noteOff(note: number, at?: number)` (`at` = AudioContext seconds, omitted = now). `MidiOutputLike.send(data: number[], timestamp?: number)`. `new MidiOutSink(port, channel, portTime?: (at: number) => number)`. `SinkFactory.portTime(at: number): number`. `audioToPortTime(at: number): number` in `src/sound/audioTime.ts`. `FakeSink` logs `on 60 90 @0.75` / `off 60 @1.125` when a time is given, unchanged otherwise.

- [ ] **Step 1: Write the failing tests**

Append to `src/sound/midiOutSink.test.ts` inside the `describe`:

```ts
  it('stamps timed notes with the port time', () => {
    const sent: [number[], number | undefined][] = [];
    const sink = new MidiOutSink({ send: (d, t) => void sent.push([d, t]) }, 3, (at) => 1000 + at * 1000);
    sink.noteOn(60, 100, 2);
    sink.noteOff(60, 2.5);
    sink.noteOn(62, 100);
    expect(sent).toEqual([
      [[0x92, 60, 100], 3000],
      [[0x82, 60, 0], 3500],
      [[0x92, 62, 100], undefined],
    ]);
  });
```

In `src/sound/moduleOutputs.test.ts`, make the fakes record times. Replace `internalSink`'s `noteOn`/`noteOff` lines, `addPort`, and the `factory` assignment in `beforeEach`:

```ts
const when = (t?: number) => (t === undefined ? '' : ` @${t}`);

function internalSink(id: ModuleId, preset: string): InternalSink {
  const tag = `${id}/${preset}`;
  return {
    noteOn: (n, v, at) => void log.push(`${tag} on ${n} ${v}${when(at)}`),
    noteOff: (n, at) => void log.push(`${tag} off ${n}${when(at)}`),
    pitchBend: () => {},
    cc: () => {},
    allNotesOff: () => void log.push(`${tag} allOff`),
    setVolume: (v) => void log.push(`${tag} vol ${v}`),
    dispose: () => void log.push(`${tag} dispose`),
  };
}

function addPort(name: string) {
  ports.set(name, { send: (d, t) => void log.push(`${name} ${d.join(',')}${when(t)}`) });
}
```

```ts
  factory = { internal: internalSink, midiPort: (name) => ports.get(name) ?? null, portTime: (at) => at * 1000 };
```

Also change the `ports` declaration to `let ports: Map<string, { send(d: number[], t?: number): void }>;`, then add this test inside the `describe`:

```ts
  it('passes note times to every sink, as port time for MIDI', () => {
    addPort('Bome');
    settings.modules.keys.port = 'Bome';
    outputs.sync(settings);
    log = [];
    outputs.sink('keys').noteOn(60, 100, 2);
    outputs.sink('keys').noteOff(60, 2.25);
    expect(log).toEqual([
      'keys/epiano on 60 100 @2', 'Bome 144,60,100 @2000',
      'keys/epiano off 60 @2.25', 'Bome 128,60,0 @2250',
    ]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/sound`
Expected: FAIL. The new MIDI test receives no timestamps, and the outputs test fails to compile or receives no `@` times.

- [ ] **Step 3: Implement**

`src/modules/module.ts` — the `NoteSink` interface:

```ts
/** Where a module's notes go: the internal synth, a MIDI port, or both (spec §5.1). */
export interface NoteSink {
  /** `at`: AudioContext time in seconds when the note sounds; omitted = now. */
  noteOn(note: number, velocity: number, at?: number): void; // velocity 1..127
  noteOff(note: number, at?: number): void;
  pitchBend(bend: number): void; // -1..1
  cc(controller: number, value: number): void;
  allNotesOff(): void;
}
```

`src/modules/testSink.ts`:

```ts
import type { NoteSink } from './module';

const when = (at?: number) => (at === undefined ? '' : ` @${at}`);

/** Records sink calls as strings, for module tests. Timed notes end in ` @<time>`. */
export class FakeSink implements NoteSink {
  log: string[] = [];
  noteOn(note: number, velocity: number, at?: number) { this.log.push(`on ${note} ${velocity}${when(at)}`); }
  noteOff(note: number, at?: number) { this.log.push(`off ${note}${when(at)}`); }
  pitchBend(bend: number) { this.log.push(`bend ${bend}`); }
  cc(controller: number, value: number) { this.log.push(`cc ${controller} ${value}`); }
  allNotesOff() { this.log.push('allOff'); }
  take(): string[] {
    const l = this.log;
    this.log = [];
    return l;
  }
}
```

`src/sound/midiOutSink.ts`:

```ts
import type { NoteSink } from '../modules/module';

export interface MidiOutputLike {
  send(data: number[], timestamp?: number): void;
}

/** Sends a module's notes to one MIDI output port and channel, tracking sounding notes. */
export class MidiOutSink implements NoteSink {
  private sounding = new Set<number>();
  private ch: number;

  constructor(
    private port: MidiOutputLike,
    channel: number, // 1..16
    private portTime?: (at: number) => number, // AudioContext seconds → port timestamp (ms)
  ) {
    this.ch = channel - 1;
  }

  noteOn(note: number, velocity: number, at?: number): void {
    const t = this.stamp(at);
    if (this.sounding.has(note)) this.send([0x80 | this.ch, note, 0], t);
    this.send([0x90 | this.ch, note, Math.min(127, Math.max(1, Math.round(velocity)))], t);
    this.sounding.add(note);
  }

  noteOff(note: number, at?: number): void {
    if (!this.sounding.delete(note)) return;
    this.send([0x80 | this.ch, note, 0], this.stamp(at));
  }

  pitchBend(bend: number): void {
    const v = Math.min(16383, Math.max(0, Math.round(bend * 8192) + 8192));
    this.send([0xe0 | this.ch, v & 0x7f, v >> 7]);
  }

  cc(controller: number, value: number): void {
    this.send([0xb0 | this.ch, controller, value]);
  }

  allNotesOff(): void {
    for (const note of this.sounding) this.send([0x80 | this.ch, note, 0]);
    this.sounding.clear();
    this.send([0xb0 | this.ch, 123, 0]);
  }

  private stamp(at?: number): number | undefined {
    return at === undefined || !this.portTime ? undefined : this.portTime(at);
  }

  private send(data: number[], timestamp?: number): void {
    try {
      this.port.send(data, timestamp);
    } catch {
      // port vanished mid-send; the next sync removes this sink
    }
  }
}
```

`src/sound/moduleOutputs.ts` — add `portTime` to the factory, pass times through `FanoutSink`, and hand `portTime` to each `MidiOutSink`:

```ts
export interface SinkFactory {
  internal(id: ModuleId, preset: string): InternalSink;
  /** The connected output with this name, or null when it is not present. */
  midiPort(name: string): MidiOutputLike | null;
  /** An AudioContext time (s) as a MIDI port timestamp (ms). */
  portTime(at: number): number;
}
```

```ts
  noteOn(note: number, velocity: number, at?: number): void {
    for (const s of this.sinks) s.noteOn(note, velocity, at);
  }
  noteOff(note: number, at?: number): void {
    for (const s of this.sinks) s.noteOff(note, at);
  }
```

```ts
      route.midi = port && midiKey
        ? { key: midiKey, sink: new MidiOutSink(port, m.channel, (at) => this.factory.portTime(at)), volume: -1 }
        : null;
```

`src/sound/audioTime.ts`:

```ts
import * as Tone from 'tone';

/** An AudioContext time (s) as a Web MIDI timestamp (performance.now() ms); past times mean now. */
export function audioToPortTime(at: number): number {
  return performance.now() + Math.max(0, at - Tone.immediate()) * 1000;
}
```

`src/sound/toneSink.ts` — `noteOn`/`noteOff`:

```ts
  noteOn(note: number, velocity: number, at?: number): void {
    const t = at ?? Tone.immediate();
    if (this.sounding.has(note)) this.voice.release(note, t);
    this.voice.attack(note, velocity / 127, t);
    this.sounding.add(note);
  }

  noteOff(note: number, at?: number): void {
    if (!this.sounding.delete(note)) return;
    this.voice.release(note, at ?? Tone.immediate());
  }
```

`src/main.ts` — import `audioToPortTime` from `./sound/audioTime` and add it to the factory:

```ts
const outputs = new ModuleOutputs({
  internal: (id, preset) =>
    new ToneSink(createVoice(preset), id === 'keys' || id === 'pad' ? master.toneInput : master.input, id === 'melody'),
  midiPort: (name) => midi?.output(name) ?? null,
  portTime: audioToPortTime,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all unit tests PASS (existing ones unchanged: untimed notes log as before).

- [ ] **Step 5: Commit**

```bash
git add src/modules/module.ts src/modules/testSink.ts src/sound/midiOutSink.ts src/sound/midiOutSink.test.ts \
  src/sound/moduleOutputs.ts src/sound/moduleOutputs.test.ts src/sound/toneSink.ts src/sound/audioTime.ts src/main.ts
git commit -m "Let sinks play notes at a given time, with MIDI timestamps"
```

---

### Task 3: Settings v2 and the Arp and Strum module slots (§5.2, §6)

**Files:**
- Modify: `src/core/store.ts`, `src/sound/presets.ts`, `src/ui/moduleStrip.ts:5`, `src/main.ts` (factory), `e2e/modules.spec.ts` (preset test)
- Test: `src/core/store.test.ts`

**Interfaces:**
- Consumes: `TEMPO_MIN`, `TEMPO_MAX`, `TEMPO_DEFAULT` from `src/core/clock.ts` (Task 1).
- Produces: `ModuleId = 'keys' | 'pad' | 'bass' | 'melody' | 'arp' | 'strum'`; `MODULE_IDS` in that order; `type ArpPattern = 'up' | 'down' | 'upDown' | 'random'`, `ARP_PATTERNS`; `type ArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T'`, `ARP_RATES` (slow → fast); `interface ArpSettings { pattern; rate; octaves: 1 | 2 | 3; gate: number }`; `type ModStripFunction = 'vibrato' | 'strum'`; `Settings` gains `tempo: number`, `metronome: boolean`, `modStrip: ModStripFunction`, `arp: ArpSettings`; `STORAGE_KEY = 'nopia-web.settings.v2'`; presets `bell` and `harp`.

- [ ] **Step 1: Write the failing tests** — in `src/core/store.test.ts`, change line 27's expectation to all six channels:

```ts
    expect(Object.values(s.modules).map((m) => m.channel)).toEqual([1, 4, 2, 5, 3, 6]);
```

and add, inside the `describe`:

```ts
  it('defaults the rhythm settings: 100 BPM, no click, Strum on the mod strip, Arp off', () => {
    const s = defaultSettings();
    expect([s.tempo, s.metronome, s.modStrip]).toEqual([100, false, 'strum']);
    expect(s.arp).toEqual({ pattern: 'up', rate: '1/8', octaves: 1, gate: 0.5 });
    expect([s.modules.arp.enabled, s.modules.arp.preset, s.modules.strum.enabled, s.modules.strum.preset])
      .toEqual([false, 'pluck', true, 'harp']);
  });

  it('rejects out-of-range rhythm settings', () => {
    const valid = (patch: (s: Settings) => void) => {
      const s = defaultSettings();
      patch(s);
      return isValidSettings(s);
    };
    expect(valid((s) => (s.tempo = 240))).toBe(true);
    expect(valid((s) => (s.tempo = 241))).toBe(false);
    expect(valid((s) => (s.tempo = 100.5))).toBe(false);
    expect(valid((s) => (s.arp.gate = 0.05))).toBe(false);
    expect(valid((s) => ((s.arp as { rate: string }).rate = '1/32'))).toBe(false);
    expect(valid((s) => ((s as { modStrip: string }).modStrip = 'pitch'))).toBe(false);
  });

  it('ignores settings saved by milestone 1 under the v1 key', () => {
    const v1 = { ...defaultSettings(), tonic: 5 };
    const store = new Store(memoryStorage({ 'nopia-web.settings.v1': JSON.stringify(v1) }));
    expect(store.get().tonic).toBe(0);
    expect(STORAGE_KEY).toBe('nopia-web.settings.v2');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/core/store.test.ts`
Expected: FAIL (no `tempo`, `arp`, … and four channels).

- [ ] **Step 3: Implement**

`src/core/store.ts` — add the import, the module ids, the presets, the rhythm types, the new settings, defaults and validation. Changed and new parts:

```ts
import type { ExtLevel, HarmonySettings, LayoutMode, TableId, Tonality } from '../harmony/theory';
import { TEMPO_DEFAULT, TEMPO_MAX, TEMPO_MIN } from './clock';

export type ModuleId = 'keys' | 'pad' | 'bass' | 'melody' | 'arp' | 'strum';
export const MODULE_IDS: ModuleId[] = ['keys', 'pad', 'bass', 'melody', 'arp', 'strum'];
```

Add to `PRESET_CHOICES`, after `melody`:

```ts
  arp: [
    { id: 'pluck', label: 'Pluck' },
    { id: 'bell', label: 'Bell' },
  ],
  strum: [
    { id: 'harp', label: 'Harp' },
    { id: 'pluck', label: 'Pluck' },
  ],
```

After `MasterSettings`:

```ts
export type ArpPattern = 'up' | 'down' | 'upDown' | 'random';
export const ARP_PATTERNS: ArpPattern[] = ['up', 'down', 'upDown', 'random'];
export type ArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T';
/** Slow to fast. */
export const ARP_RATES: ArpRate[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T'];

export interface ArpSettings {
  pattern: ArpPattern;
  rate: ArpRate;
  octaves: 1 | 2 | 3;
  gate: number; // 0.1..1, fraction of a step
}

export type ModStripFunction = 'vibrato' | 'strum';
```

`Settings` gains:

```ts
  tempo: number; // whole BPM, 40..240
  metronome: boolean;
  modStrip: ModStripFunction;
  arp: ArpSettings;
```

`STORAGE_KEY`:

```ts
export const STORAGE_KEY = 'nopia-web.settings.v2';
```

In `defaultSettings()`, the modules and the new fields (keep the rest as is):

```ts
    modules: {
      keys: mod('epiano', 1, 0.8),
      pad: mod('warmPad', 4, 0.5),
      bass: mod('sub', 2, 0.7),
      melody: mod('lead', 5, 0.8),
      arp: { ...mod('pluck', 3, 0.6), enabled: false }, // would double every chord on first launch
      strum: mod('harp', 6, 0.7),
    },
    master: { volume: 0.8, reverb: 0.25, delay: 0.1, tone: 0.8 },
    input: null,
    tempo: TEMPO_DEFAULT,
    metronome: false,
    modStrip: 'strum',
    arp: { pattern: 'up', rate: '1/8', octaves: 1, gate: 0.5 },
```

Validation — add `isArp` after `isModule`, and four checks at the end of `isValidSettings`:

```ts
function isArp(v: unknown): boolean {
  return isObj(v) && isOneOf(v.pattern, ARP_PATTERNS) && isOneOf(v.rate, ARP_RATES) &&
    isOneOf(v.octaves, [1, 2, 3]) && typeof v.gate === 'number' && v.gate >= 0.1 && v.gate <= 1;
}
```

```ts
    isNameOrNull(v.input) &&
    isInt(v.tempo, TEMPO_MIN, TEMPO_MAX) &&
    typeof v.metronome === 'boolean' &&
    isOneOf(v.modStrip, ['vibrato', 'strum'] satisfies ModStripFunction[]) &&
    isArp(v.arp);
```

`src/sound/presets.ts` — add to `PRESETS`, after `glass`:

```ts
  bell: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 5.07,
        modulationIndex: 12,
        envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 },
        modulationEnvelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.6 },
        volume: -16,
      }),
    ),
  harp: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.2 },
        volume: -10,
      }),
    ),
```

`src/ui/moduleStrip.ts` line 5:

```ts
const NAMES: Record<ModuleId, string> = { keys: 'Keys', pad: 'Pad', bass: 'Bass', melody: 'Melody', arp: 'Arp', strum: 'Strum' };
```

`src/main.ts` — the Tone (low-pass) input now serves the Arp too:

```ts
  internal: (id, preset) =>
    new ToneSink(createVoice(preset), id === 'keys' || id === 'pad' || id === 'arp' ? master.toneInput : master.input, id === 'melody'),
```

`e2e/modules.spec.ts` — the preset test covers the new presets (line `const presets = …`):

```ts
    const presets = {
      keys: ['organ', 'pluck', 'epiano'], pad: ['glass', 'warmPad'], bass: ['sawBass', 'sub'], melody: ['leadGlide', 'lead'],
      arp: ['bell', 'pluck'], strum: ['pluck', 'harp'],
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: all PASS, 20 browser tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/core/store.test.ts src/sound/presets.ts src/ui/moduleStrip.ts src/main.ts e2e/modules.spec.ts
git commit -m "Add rhythm settings and the Arp and Strum module slots"
```

---

### Task 4: Tempo, Arp rate and the new volumes as learnable controls (§4.3)

**Files:**
- Modify: `src/core/store.ts` (`ControlTarget`, `CONTROL_TARGETS`), `src/input/controlMap.ts`
- Test: `src/input/controlMap.test.ts`

**Interfaces:**
- Consumes: `clampTempo`, `TEMPO_MIN`, `TEMPO_MAX` (Task 1); `ARP_RATES`, `Settings.tempo`, `Settings.arp.rate` (Task 3).
- Produces: `ControlTarget` gains `'vol.arp' | 'vol.strum' | 'tempo' | 'arpRate'`. `CONTROL_TARGETS` order: extensions, layout, tonality, table, vol.keys, vol.pad, vol.bass, vol.melody, vol.arp, vol.strum, tone, reverb, delay, master, tempo, arpRate, panic. `TARGET_INFO` has labels for all.

- [ ] **Step 1: Write the failing tests** — append to the `targets` describe in `src/input/controlMap.test.ts`:

```ts
  it('maps Tempo onto 40–240 BPM in absolute mode and 1 BPM per relative tick', () => {
    map.arm('tempo');
    map.handleCC(1, 40, 0); // learn
    map.setMode('tempo', 'absolute');
    map.handleCC(1, 40, 127);
    expect(store.get().tempo).toBe(240);
    map.handleCC(1, 40, 0);
    expect(store.get().tempo).toBe(40);
    map.setMode('tempo', 'relative');
    map.handleCC(1, 40, 3); // +3
    expect(store.get().tempo).toBe(43);
    map.handleCC(1, 40, 127); // −1
    expect(store.get().tempo).toBe(42);
  });

  it('steps the Arp rate from 1/4 to 1/16T over 5 absolute ranges', () => {
    map.arm('arpRate');
    map.handleCC(1, 41, 0);
    map.setMode('arpRate', 'absolute');
    const rates = [0, 25, 26, 51, 52, 76, 77, 102, 103, 127].map((v) => {
      map.handleCC(1, 41, v);
      return store.get().arp.rate;
    });
    expect(rates).toEqual(['1/4', '1/4', '1/8', '1/8', '1/8T', '1/8T', '1/16', '1/16', '1/16T', '1/16T']);
  });

  it('counts relative ticks separately for each stepped target', () => {
    map.arm('arpRate');
    map.handleCC(1, 41, 0);
    map.setMode('arpRate', 'relative');
    map.setMode('extensions', 'relative');
    for (let i = 0; i < TICKS_PER_STEP - 1; i++) map.handleCC(1, 14, 1); // Extensions: one tick short
    map.handleCC(1, 41, 1); // a single Arp-rate tick must not complete Extensions' step
    expect([store.get().extLevel, store.get().arp.rate]).toEqual([0, '1/8']);
    for (let i = 0; i < TICKS_PER_STEP - 1; i++) map.handleCC(1, 41, 1);
    expect(store.get().arp.rate).toBe('1/8T');
  });

  it('controls the Arp and Strum volumes', () => {
    map.arm('vol.strum');
    map.handleCC(1, 42, 0);
    map.setMode('vol.strum', 'absolute');
    map.handleCC(1, 42, 127);
    expect(store.get().modules.strum.volume).toBe(1);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/input/controlMap.test.ts`
Expected: FAIL. The new target names don't typecheck, and the arm/learn calls bind targets that `apply()` can't handle.

- [ ] **Step 3: Implement**

`src/core/store.ts`:

```ts
export type ControlTarget =
  | 'extensions'
  | 'layout'
  | 'tonality'
  | 'table'
  | 'vol.keys'
  | 'vol.pad'
  | 'vol.bass'
  | 'vol.melody'
  | 'vol.arp'
  | 'vol.strum'
  | 'tone'
  | 'reverb'
  | 'delay'
  | 'master'
  | 'tempo'
  | 'arpRate'
  | 'panic';

export const CONTROL_TARGETS: ControlTarget[] = [
  'extensions', 'layout', 'tonality', 'table',
  'vol.keys', 'vol.pad', 'vol.bass', 'vol.melody', 'vol.arp', 'vol.strum',
  'tone', 'reverb', 'delay', 'master', 'tempo', 'arpRate', 'panic',
];
```

`src/input/controlMap.ts` — full file:

```ts
import { clampTempo, TEMPO_MAX, TEMPO_MIN } from '../core/clock';
import {
  ARP_RATES,
  type Binding,
  type ControlTarget,
  type EncoderMode,
  type ModuleId,
  type Settings,
  type Store,
} from '../core/store';
import type { ExtLevel } from '../harmony/theory';

type TargetKind = 'continuous' | 'stepped' | 'toggle' | 'trigger';

export const TARGET_INFO: Record<ControlTarget, { label: string; kind: TargetKind }> = {
  extensions: { label: 'Extensions', kind: 'stepped' },
  layout: { label: 'Real/Static', kind: 'toggle' },
  tonality: { label: 'Major/Minor', kind: 'toggle' },
  table: { label: 'Table', kind: 'toggle' },
  'vol.keys': { label: 'Keys volume', kind: 'continuous' },
  'vol.pad': { label: 'Pad volume', kind: 'continuous' },
  'vol.bass': { label: 'Bass volume', kind: 'continuous' },
  'vol.melody': { label: 'Melody volume', kind: 'continuous' },
  'vol.arp': { label: 'Arp volume', kind: 'continuous' },
  'vol.strum': { label: 'Strum volume', kind: 'continuous' },
  tone: { label: 'Tone', kind: 'continuous' },
  reverb: { label: 'Reverb send', kind: 'continuous' },
  delay: { label: 'Delay send', kind: 'continuous' },
  master: { label: 'Master volume', kind: 'continuous' },
  tempo: { label: 'Tempo', kind: 'continuous' },
  arpRate: { label: 'Arp rate', kind: 'stepped' },
  panic: { label: 'Panic', kind: 'trigger' },
};

/** Values received before a 'detect' binding is declared relative. */
export const DETECT_SAMPLES = 8;
/** Relative-encoder ticks per step of a stepped target (Extensions, Arp rate). */
export const TICKS_PER_STEP = 8;

const TEMPO_SPAN = TEMPO_MAX - TEMPO_MIN;

const inRelativeRange = (v: number) => (v >= 1 && v <= 10) || (v >= 118 && v <= 127);
const relativeDelta = (v: number) => (v < 64 ? v : v - 128);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** How far one relative-encoder tick moves a continuous target, on its 0..1 scale: Tempo moves 1 BPM. */
const relativeStep = (target: ControlTarget) => (target === 'tempo' ? 1 / TEMPO_SPAN : 1 / 127);

function getUnit(s: Settings, target: ControlTarget): number {
  if (target.startsWith('vol.')) return s.modules[target.slice(4) as ModuleId].volume;
  if (target === 'master') return s.master.volume;
  if (target === 'tempo') return (s.tempo - TEMPO_MIN) / TEMPO_SPAN;
  return s.master[target as 'tone' | 'reverb' | 'delay'];
}

function setUnit(s: Settings, target: ControlTarget, v: number): void {
  if (target.startsWith('vol.')) s.modules[target.slice(4) as ModuleId].volume = v;
  else if (target === 'master') s.master.volume = v;
  else if (target === 'tempo') s.tempo = clampTempo(TEMPO_MIN + v * TEMPO_SPAN);
  else s.master[target as 'tone' | 'reverb' | 'delay'] = v;
}

interface Stepped {
  count: number;
  get(s: Settings): number;
  set(s: Settings, step: number): void;
}

const STEPPED: Partial<Record<ControlTarget, Stepped>> = {
  extensions: { count: 4, get: (s) => s.extLevel, set: (s, i) => (s.extLevel = i as ExtLevel) },
  arpRate: {
    count: ARP_RATES.length,
    get: (s) => ARP_RATES.indexOf(s.arp.rate),
    set: (s, i) => (s.arp.rate = ARP_RATES[i]),
  },
};

function toggle(s: Settings, target: ControlTarget): void {
  if (target === 'layout') s.layout = s.layout === 'real' ? 'static' : 'real';
  if (target === 'tonality') s.tonality = s.tonality === 'major' ? 'minor' : 'major';
  if (target === 'table') s.table = s.table === 'secdom' ? 'borrowed' : 'secdom';
}

const key = (channel: number, cc: number) => `${channel}:${cc}`;

/** MIDI learn and CC → settings mapping (spec §4.3). */
export class ControlMap {
  private armed: ControlTarget | null = null;
  private samples = new Map<string, number>();
  private stepTicks = new Map<ControlTarget, number>();
  private listeners: (() => void)[] = [];

  constructor(
    private store: Store,
    private actions: { panic(): void },
  ) {}

  /** Arm a target for learning; the next CC received binds to it. null disarms. */
  arm(target: ControlTarget | null): void {
    this.armed = target;
    this.notify();
  }

  armedTarget(): ControlTarget | null {
    return this.armed;
  }

  onArmedChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  setMode(target: ControlTarget, mode: EncoderMode): void {
    this.store.update((s) => {
      const b = s.bindings.find((x) => x.target === target);
      if (b) b.mode = mode;
    });
  }

  unbind(target: ControlTarget): void {
    this.store.update((s) => {
      s.bindings = s.bindings.filter((b) => b.target !== target);
    });
  }

  /** Returns true when the CC was consumed (learned or bound). Channel is 1..16. */
  handleCC(channel: number, cc: number, value: number): boolean {
    if (this.armed) {
      const target = this.armed;
      this.store.update((s) => {
        s.bindings = s.bindings.filter((b) => b.target !== target && key(b.channel, b.cc) !== key(channel, cc));
        s.bindings.push({ target, channel, cc, mode: 'detect' });
      });
      this.samples.delete(key(channel, cc));
      this.arm(null);
      return true;
    }
    const binding = this.store.get().bindings.find((b) => b.channel === channel && b.cc === cc);
    if (!binding) return false;
    this.apply(binding, value);
    return true;
  }

  private apply(binding: Binding, value: number): void {
    const { target } = binding;
    const { kind } = TARGET_INFO[target];
    if (kind === 'trigger') {
      if (value > 63) this.actions.panic();
      return;
    }
    if (kind === 'toggle') {
      if (value > 63) this.store.update((s) => toggle(s, target));
      return;
    }
    const mode = binding.mode === 'detect' ? this.detect(binding, value) : binding.mode;
    if (kind === 'stepped') {
      this.applyStepped(target, mode, value);
      return;
    }
    const v = mode === 'absolute'
      ? value / 127
      : clamp01(getUnit(this.store.get(), target) + relativeDelta(value) * relativeStep(target));
    this.store.update((s) => setUnit(s, target, v));
  }

  /** Decide a 'detect' binding's mode; values that could be relative are applied as relative meanwhile. */
  private detect(binding: Binding, value: number): 'absolute' | 'relative' {
    const k = key(binding.channel, binding.cc);
    if (!inRelativeRange(value)) {
      this.setMode(binding.target, 'absolute');
      return 'absolute';
    }
    const n = (this.samples.get(k) ?? 0) + 1;
    this.samples.set(k, n);
    if (n >= DETECT_SAMPLES) this.setMode(binding.target, 'relative');
    return 'relative';
  }

  private applyStepped(target: ControlTarget, mode: 'absolute' | 'relative', value: number): void {
    const { count, get, set } = STEPPED[target]!;
    const current = get(this.store.get());
    let step = current;
    if (mode === 'absolute') {
      step = Math.min(count - 1, Math.floor((value * count) / 128));
    } else {
      let ticks = (this.stepTicks.get(target) ?? 0) + relativeDelta(value);
      while (ticks >= TICKS_PER_STEP) { step++; ticks -= TICKS_PER_STEP; }
      while (ticks <= -TICKS_PER_STEP) { step--; ticks += TICKS_PER_STEP; }
      step = Math.min(count - 1, Math.max(0, step));
      // at an end stop, ticks pushing further are dropped so the first turn back steps at once
      if ((step === count - 1 && ticks > 0) || (step === 0 && ticks < 0)) ticks = 0;
      this.stepTicks.set(target, ticks);
    }
    if (step !== current) this.store.update((s) => set(s, step));
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npx vitest run src/input`
Expected: PASS (the milestone-1 Extensions tests unchanged, plus the 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/input/controlMap.ts src/input/controlMap.test.ts
git commit -m "Make Tempo, Arp rate and the Arp and Strum volumes learnable"
```

---

### Task 5: The Arp module (§5.5)

**Files:**
- Create: `src/modules/arp.ts`
- Test: `src/modules/arp.test.ts`

**Interfaces:**
- Consumes: bus `tick` (Task 1); `NoteSink` with `at` and `FakeSink` (Task 2); `ArpSettings`, `defaultSettings().arp` (Task 3); `Voicer` from `src/harmony/voicing.ts`.
- Produces: `RATE_TICKS: Record<ArpRate, number>`; `arpNotes(voicing: number[], octaves: number): number[]`; `arpCycle(notes: number[], pattern: ArpPattern): number[]`; `class ArpModule implements Module` with `constructor(out: NoteSink, settings: () => ArpSettings, random?: () => number)`.

- [ ] **Step 1: Write the failing test** — `src/modules/arp.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import { defaultSettings, type ArpSettings } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { arpCycle, arpNotes, ArpModule } from './arp';
import { FakeSink } from './testSink';

const harmony: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number) => chordForKey(key, harmony);
const DUR = 0.125; // seconds per grid tick in these tests

let sink: FakeSink;
let arp: ArpSettings;
let random: number;
let mod: ArpModule;

const send = (body: BusEventBody) => mod.handle({ ...body, time: 0 } as BusEvent);
const tick = (n: number, at = n * DUR, dur = DUR) => send({ type: 'tick', tick: n, at, dur });

/** Sends ticks from..to (inclusive) and returns what the sink received. */
function ticks(from: number, to: number): string[] {
  for (let n = from; n <= to; n++) tick(n);
  return sink.take();
}

beforeEach(() => {
  sink = new FakeSink();
  arp = { ...defaultSettings().arp }; // up, 1/8 = 6 ticks, 1 octave, gate 0.5
  random = 0;
  mod = new ArpModule(sink, () => arp, () => random);
});

describe('arp notes and patterns', () => {
  it('extends the voicing over octaves, low to high', () => {
    expect(arpNotes([60, 64, 67], 1)).toEqual([60, 64, 67]);
    expect(arpNotes([60, 64, 67], 2)).toEqual([60, 64, 67, 72, 76, 79]);
  });

  it('plays up, down, and up-down without repeating the ends', () => {
    expect(arpCycle([60, 64, 67, 72], 'up')).toEqual([60, 64, 67, 72]);
    expect(arpCycle([60, 64, 67, 72], 'down')).toEqual([72, 67, 64, 60]);
    expect(arpCycle([60, 64, 67, 72], 'upDown')).toEqual([60, 64, 67, 72, 67, 64]);
    expect(arpCycle([60, 64], 'upDown')).toEqual([60, 64]);
    expect(arpCycle([60], 'upDown')).toEqual([60]);
  });
});

describe('ArpModule', () => {
  it('plays one note per step on the grid, from the first grid step after the chord', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // C: 60 64 67
    expect(ticks(3, 5)).toEqual([]);
    expect(ticks(6, 6)).toEqual(['on 60 90 @0.75']);
    expect(ticks(7, 12)).toEqual(['off 60 @1.125', 'on 64 90 @1.5']);
    expect(ticks(13, 18)).toEqual(['off 64 @1.875', 'on 67 90 @2.25']);
    expect(ticks(19, 24)).toEqual(['off 67 @2.625', 'on 60 90 @3']);
  });

  it('follows the rate and the gate', () => {
    arp.rate = '1/16'; // 3 ticks
    arp.gate = 1;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 6)).toEqual(['on 60 90 @0', 'off 60 @0.375', 'on 64 90 @0.375', 'off 64 @0.75', 'on 67 90 @0.75']);
  });

  it('extends over octaves', () => {
    arp.octaves = 2;
    arp.pattern = 'down';
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 0)).toEqual(['on 79 90 @0']);
  });

  it('picks random notes with the given random source', () => {
    arp.pattern = 'random';
    random = 0.99;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 0)).toEqual(['on 67 90 @0']);
  });

  it('swaps in a new chord from the next step and continues the pattern', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 6); // C: 60 at tick 0, 64 at tick 6
    send({ type: 'chordChange', chord: chord(5), velocity: 80, retrigger: true }); // F, voiced 60 65 69
    expect(ticks(7, 12).filter((l) => l.startsWith('on'))).toEqual(['on 69 80 @1.5']);
  });

  it('restarts the pattern when a chord starts from silence', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 6); // 60, 64
    send({ type: 'chordOff' });
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(7, 12).filter((l) => l.startsWith('on'))).toEqual(['on 60 90 @1.5']);
  });

  it('is silent without a chord, letting the last note finish its gate', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 0); // on 60 @0, its note-off due at 0.375
    send({ type: 'chordOff' });
    expect(ticks(1, 24)).toEqual(['off 60 @0.375']);
  });

  it('panic ends a step scheduled ahead at its own start time', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(6, 6); // on 60 @0.75: the audio clock may not have reached it yet
    send({ type: 'panic' });
    expect(sink.take()).toEqual(['off 60 @0.751', 'allOff']);
    expect(ticks(7, 24)).toEqual([]);
  });

  it('at gate 100% a repeated note ends before it restarts', () => {
    arp.pattern = 'random';
    arp.gate = 1;
    random = 0; // always the lowest note
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 6)).toEqual(['on 60 90 @0', 'off 60 @0.75', 'on 60 90 @0.75']);
  });

  it('ends a ringing note before restarting it after a rate change', () => {
    arp.pattern = 'random'; // random = 0: always 60
    arp.rate = '1/4';
    arp.gate = 1;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 0); // on 60 @0, note-off due at 1.5
    arp.rate = '1/16';
    expect(ticks(1, 12)).toEqual([
      'off 60 @0.375', 'on 60 90 @0.375', // the 1/4 note is cut where the 1/16 one starts
      'off 60 @0.75', 'on 60 90 @0.75',
      'off 60 @1.125', 'on 60 90 @1.125',
      'off 60 @1.5', 'on 60 90 @1.5', // one note-off at 1.5: the 1/4 note's own was dropped
    ]);
  });

  it('keeps the gate a note started with when the tempo changes', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    tick(6); // on 60 @0.75, note-off due at 1.125
    sink.take();
    tick(7, 0.875, 0.25); // the tempo halves: ticks are now 0.25 s apart
    expect(sink.take()).toEqual([]);
    tick(8, 1.125, 0.25);
    expect(sink.take()).toEqual(['off 60 @1.125']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/arp.test.ts`
Expected: FAIL — `Failed to resolve import "./arp"`.

- [ ] **Step 3: Implement** — `src/modules/arp.ts`:

```ts
import type { BusEvent } from '../core/bus';
import type { ArpPattern, ArpRate, ArpSettings } from '../core/store';
import { Voicer } from '../harmony/voicing';
import type { Module, NoteSink } from './module';

/** Grid ticks per Arp step (12 ticks per quarter note). */
export const RATE_TICKS: Record<ArpRate, number> = { '1/4': 12, '1/8': 6, '1/8T': 4, '1/16': 3, '1/16T': 2 };

/** On panic, a step that has not started yet ends this long (s) after its start. */
const PANIC_GAP = 0.001;

/** The Arp's notes: the Keys voicing repeated over `octaves`, low to high. */
export function arpNotes(voicing: number[], octaves: number): number[] {
  const notes: number[] = [];
  for (let o = 0; o < octaves; o++) for (const n of voicing) notes.push(n + 12 * o);
  return notes.sort((a, b) => a - b);
}

/** One cycle of a pattern over `notes` (ascending). For 'random' the module picks from it. */
export function arpCycle(notes: number[], pattern: ArpPattern): number[] {
  if (pattern === 'down') return [...notes].reverse();
  if (pattern === 'upDown') return [...notes, ...notes.slice(1, -1).reverse()];
  return notes;
}

interface Pending {
  note: number;
  on: number; // AudioContext time the note starts
  off: number; // and ends
}

/** Arpeggiates the held chord on the clock grid (spec §5.5). */
export class ArpModule implements Module {
  readonly id = 'arp' as const;
  private voicer = new Voicer(); // follows the same chords as Keys, so it voices identically
  private chord: { voicing: number[]; velocity: number } | null = null;
  private step = 0;
  private pending: Pending[] = []; // started notes whose note-off is not sent yet

  constructor(
    private out: NoteSink,
    private settings: () => ArpSettings,
    private random: () => number = Math.random,
  ) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'chordOn':
        this.step = 0;
        this.chord = { voicing: this.voicer.next(e.chord), velocity: e.velocity };
        break;
      case 'chordChange':
        this.chord = { voicing: this.voicer.next(e.chord), velocity: e.velocity };
        break;
      case 'chordOff':
        this.chord = null;
        break;
      case 'tick':
        this.tick(e.tick, e.at, e.dur);
        break;
      case 'panic':
        this.allNotesOff();
        break;
    }
  }

  allNotesOff(): void {
    // a step scheduled ahead may not have started yet, and a sink cannot cancel it: end it as it starts
    for (const p of this.pending) this.out.noteOff(p.note, p.on + PANIC_GAP);
    this.pending = [];
    this.out.allNotesOff();
    this.chord = null;
    this.step = 0;
    this.voicer.reset();
  }

  private tick(tick: number, at: number, dur: number): void {
    // note-offs due before the next tick go out now, ahead of any note-on at the same time
    const due = this.pending.filter((p) => p.off < at + dur);
    this.pending = this.pending.filter((p) => p.off >= at + dur);
    for (const p of due) this.out.noteOff(p.note, p.off);

    const s = this.settings();
    const stepTicks = RATE_TICKS[s.rate];
    if (!this.chord || tick % stepTicks !== 0) return;
    const cycle = arpCycle(arpNotes(this.chord.voicing, s.octaves), s.pattern);
    const index = s.pattern === 'random' ? Math.floor(this.random() * cycle.length) : this.step % cycle.length;
    const note = cycle[index];
    this.step++;

    // still ringing (the rate just got faster): end it where the new one starts
    if (this.pending.some((p) => p.note === note)) {
      this.pending = this.pending.filter((p) => p.note !== note);
      this.out.noteOff(note, at);
    }
    this.out.noteOn(note, this.chord.velocity, at);
    this.pending.push({ note, on: at, off: at + s.gate * stepTicks * dur });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/modules/arp.test.ts && npm run typecheck`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/arp.ts src/modules/arp.test.ts
git commit -m "Add the Arp module: patterns, rates and gate on the clock grid"
```

---

### Task 6: The Strum module and the mod strip function (§4.3, §5.6)

**Files:**
- Create: `src/modules/strum.ts`
- Modify: `src/modules/melody.ts`
- Test: `src/modules/strum.test.ts`, `src/modules/modules.test.ts` (Melody)

**Interfaces:**
- Consumes: `NoteSink`, `FakeSink` (Task 2); `ModStripFunction` (Task 3); `Voicer`; `pc` from `src/harmony/theory.ts`.
- Produces: `STRUM_RELEASE_S = 1.5`; `strumNotes(chord: Chord, low: number): number[]`; `class StrumModule implements Module` with `constructor(out: NoteSink, active: () => boolean, after: (seconds: number, fn: () => void) => void)`. `MelodyModule` constructor becomes `(out: NoteSink, modStrip: () => ModStripFunction)` and gains `modStripChanged(): void`.

- [ ] **Step 1: Write the failing tests** — `src/modules/strum.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { STRUM_RELEASE_S, StrumModule, strumNotes } from './strum';
import { FakeSink } from './testSink';

const harmony: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number) => chordForKey(key, harmony);

let sink: FakeSink;
let active: boolean;
let timers: { seconds: number; fn: () => void }[];
let strum: StrumModule;

const send = (body: BusEventBody) => strum.handle({ ...body, time: 0 } as BusEvent);
const mod = (...values: number[]) => values.forEach((value) => send({ type: 'mod', value }));
/** Runs the oldest pending timer. */
const runTimer = () => timers.shift()!.fn();

beforeEach(() => {
  sink = new FakeSink();
  active = true;
  timers = [];
  strum = new StrumModule(sink, () => active, (seconds, fn) => void timers.push({ seconds, fn }));
});

describe('strumNotes', () => {
  it('lays the chord out over two octaves from the lowest Keys note, plus the top root', () => {
    expect(strumNotes(chord(0), 60)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    expect(strumNotes(chord(0), 64)).toEqual([64, 67, 72, 76, 79, 84, 96]);
  });
});

describe('StrumModule', () => {
  it('plucks every zone the strip crosses, in order', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    expect(sink.take()).toEqual(['on 60 100']);
    mod(127);
    expect(sink.take()).toEqual(['on 64 100', 'on 67 100', 'on 72 100', 'on 76 100', 'on 79 100', 'on 84 100']);
    mod(60); // zone 3 of 7
    expect(sink.take()).toEqual(['on 79 100', 'on 76 100', 'on 72 100']);
    mod(62); // still zone 3
    expect(sink.take()).toEqual([]);
  });

  it('uses the Keys voicing of the current chord', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    send({ type: 'chordChange', chord: chord(5), velocity: 100, retrigger: true }); // F, voiced 60 65 69
    mod(127); // the first value plays only its own zone: F's top root
    expect(sink.take()).toEqual(['on 89 100']);
  });

  it('plays nothing without a chord, or while the mod strip is set to Vibrato', () => {
    mod(0, 127);
    active = false;
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0, 127);
    expect(sink.take()).toEqual([]);
  });

  it('ends each note 1.5 s after it was plucked, even when the chord is released', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    sink.take();
    expect(STRUM_RELEASE_S).toBe(1.5);
    expect(timers.map((t) => t.seconds)).toEqual([STRUM_RELEASE_S]);
    send({ type: 'chordOff' });
    expect(sink.take()).toEqual([]);
    runTimer();
    expect(sink.take()).toEqual(['off 60']);
  });

  it('re-striking a ringing note restarts its 1.5 s', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0, 20, 0); // 60, 64, then 60 again
    sink.take();
    runTimer(); // the first 60's timer: superseded by the re-strike
    expect(sink.take()).toEqual([]);
    runTimer(); // 64
    runTimer(); // the re-struck 60
    expect(sink.take()).toEqual(['off 64', 'off 60']);
  });

  it('panic silences it and cancels the pending note-offs', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    sink.take();
    send({ type: 'panic' });
    timers.splice(0).forEach((t) => t.fn());
    expect(sink.take()).toEqual(['allOff']);
    mod(127);
    expect(sink.take()).toEqual([]); // the chord is gone
  });
});
```

In `src/modules/modules.test.ts`, add `import type { ModStripFunction } from '../core/store';`, change every `new MelodyModule(sink)` to `new MelodyModule(sink, () => 'vibrato')`, and add inside `describe('MelodyModule', …)`:

```ts
  it('resets vibrato when the mod strip switches away from Vibrato, and then ignores CC1', () => {
    let fn: ModStripFunction = 'vibrato';
    const mel = new MelodyModule(sink, () => fn);
    send(mel, { type: 'mod', value: 90 });
    fn = 'strum';
    mel.modStripChanged();
    send(mel, { type: 'mod', value: 50 });
    expect(sink.take()).toEqual(['cc 1 90', 'cc 1 0']);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/modules`
Expected: FAIL. `./strum` can't be resolved, and `modStripChanged` doesn't exist.

- [ ] **Step 3: Implement**

`src/modules/strum.ts`:

```ts
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
```

`src/modules/melody.ts` — the constructor, the `mod` case, and two new methods:

```ts
import type { BusEvent } from '../core/bus';
import type { ModStripFunction } from '../core/store';
import type { Module, NoteSink } from './module';

/** Right-hand notes, pitch bend and CC1 (vibrato), with sustain-pedal note-off deferral. */
export class MelodyModule implements Module {
  readonly id = 'melody' as const;
  private sustainOn = false;
  private sustained = new Set<number>(); // released while the pedal was down
  private vibrato = 0; // the last CC1 value sent

  constructor(
    private out: NoteSink,
    private modStrip: () => ModStripFunction,
  ) {}
```

```ts
      case 'mod':
        if (this.modStrip() === 'vibrato') this.setVibrato(e.value);
        break;
```

```ts
  /** Call when the mod strip function changes: leaving Vibrato resets the vibrato depth. */
  modStripChanged(): void {
    if (this.modStrip() !== 'vibrato') this.setVibrato(0);
  }

  private setVibrato(value: number): void {
    if (value === this.vibrato) return;
    this.vibrato = value;
    this.out.cc(1, value);
  }
```

`src/main.ts` — Melody needs the getter now (the Strum module is wired in Task 8):

```ts
  new MelodyModule(outputs.sink('melody'), () => store.get().modStrip),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/strum.ts src/modules/strum.test.ts src/modules/melody.ts src/modules/modules.test.ts src/main.ts
git commit -m "Add the Strum module and route CC1 by the mod strip function"
```

---

### Task 7: Clock, metronome and Arp in the app (§5.4, §5.5, §7)

**Files:**
- Create: `src/sound/transport.ts`, `src/sound/metronome.ts`, `src/ui/rhythm.ts`, `src/ui/arpSettings.ts`, `e2e/rhythm.spec.ts`
- Modify: `src/sound/master.ts`, `src/ui/moduleStrip.ts`, `src/ui/panel.ts`, `src/ui/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: `PPQ`, `TICKS_PER_BAR`, `tickSeconds`, `TapTempo`, `clampTempo`, `TEMPO_MIN`, `TEMPO_MAX` (Task 1); bus `tick` (Task 1); `ArpModule` (Task 5); `ARP_PATTERNS`, `ARP_RATES`, `ArpSettings`, `Settings.tempo`, `Settings.metronome` (Task 3); e2e helpers `withFakeMidi`, `start`, `sendMidi`, `midiSent`, `collectErrors`, `SYNTH` (`e2e/fakeMidi.ts`).
- Produces: `createTransport(onTick: (tick: number, at: number, dur: number) => void): { setTempo(bpm: number): void; start(): void }`; `class Metronome { constructor(destination: Tone.InputNode); click(at: number, accent: boolean): void }`; `Master.clickInput`; `createRhythm(store): { el; render(s) }` (test ids `tempo`, `tap`, `metronome`; knob `data-learn="tempo"`); `createArpSettings(store): { el; render(s) }` (test ids `arp-pattern`, `arp-rate`, `arp-octaves`, `arp-gate`; `data-learn="arpRate"`); `createModuleStrip({ …, extras?: Partial<Record<ModuleId, { el: HTMLElement; render(s: Settings): void }>> })`. `e2e/rhythm.spec.ts` exports nothing, and Task 8 appends to it.

- [ ] **Step 1: Write the failing browser tests** — `e2e/rhythm.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, midiSent, sendMidi, start, SYNTH, withFakeMidi } from './fakeMidi';

/** Note numbers of the note-ons sent on a MIDI channel (1..16), in order. */
async function noteOns(page: Page, channel: number): Promise<number[]> {
  return (await midiSent(page)).filter((m) => m.data[0] === 0x8f + channel && m.data[2] > 0).map((m) => m.data[1]);
}

/** How many messages with this status byte were sent. */
async function countStatus(page: Page, status: number): Promise<number> {
  return (await midiSent(page)).filter((m) => m.data[0] === status).length;
}

async function enableArp(page: Page, rate = '1/16') {
  await page.getByTestId('arp-open').click();
  await page.getByTestId('arp-enabled').check();
  await page.getByTestId('arp-port').selectOption(SYNTH);
  await page.getByTestId('arp-rate').selectOption(rate);
}

test.describe('rhythm', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the Arp plays the held chord upward on channel 3 and stops when it is released', async ({ page }) => {
    await enableArp(page);
    await sendMidi(page, [0x90, 48, 100]); // C: Keys voicing 60 64 67
    await expect.poll(async () => (await noteOns(page, 3)).slice(0, 4)).toEqual([60, 64, 67, 60]);
    await sendMidi(page, [0x80, 48, 0]);
    await page.waitForTimeout(300); // steps already scheduled ahead may still go out
    const count = (await noteOns(page, 3)).length;
    await page.waitForTimeout(500);
    expect((await noteOns(page, 3)).length).toBe(count);
  });

  test('panic stops the Arp and leaves no note hanging', async ({ page }) => {
    await enableArp(page);
    await sendMidi(page, [0x90, 48, 100]);
    await expect.poll(async () => (await noteOns(page, 3)).length).toBeGreaterThanOrEqual(2);
    await page.getByTestId('panic').click();
    await expect.poll(() => countStatus(page, 0xb2)).toBeGreaterThan(0); // CC123 on channel 3
    const count = (await noteOns(page, 3)).length;
    await page.waitForTimeout(500);
    expect((await noteOns(page, 3)).length).toBe(count);
    expect(await countStatus(page, 0x82)).toBe(count); // a note-off for every note-on
  });

  test('tempo can be typed and tapped, and is remembered', async ({ page }) => {
    const tempo = page.getByTestId('tempo');
    await expect(tempo).toHaveValue('100');
    await tempo.fill('150');
    await tempo.blur();
    await start(page); // reload
    await expect(tempo).toHaveValue('150');
    await page.getByTestId('tap').click();
    await page.waitForTimeout(600);
    await page.getByTestId('tap').click();
    const bpm = Number(await tempo.inputValue());
    expect(bpm).toBeGreaterThanOrEqual(70);
    expect(bpm).toBeLessThanOrEqual(100);
  });

  test('the metronome toggles', async ({ page }) => {
    await page.getByTestId('metronome').click();
    await expect(page.getByTestId('metronome')).toHaveClass(/active/);
    await page.waitForTimeout(700); // a few clicks at 100 BPM, without errors
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run e2e -- e2e/rhythm.spec.ts`
Expected: FAIL. There are no `arp-rate`, `tempo`, `tap` or `metronome` elements, and no ticks yet.

- [ ] **Step 3: Implement**

`src/sound/transport.ts`:

```ts
import * as Tone from 'tone';
import { PPQ, tickSeconds } from '../core/clock';

/**
 * Tone's Transport as the grid clock (spec §5.4). `onTick` runs for every grid tick, a little
 * ahead of time: `at` is the AudioContext time the tick sounds, `dur` the seconds per tick.
 */
export function createTransport(onTick: (tick: number, at: number, dur: number) => void) {
  const transport = Tone.getTransport();
  let tick = 0;
  transport.scheduleRepeat((at) => onTick(tick++, at, tickSeconds(transport.bpm.value)), `${4 * PPQ}n`);
  return {
    setTempo(bpm: number) {
      transport.bpm.value = bpm;
    },
    /** Starts the grid once audio runs; it then runs for the whole session. */
    start() {
      if (transport.state !== 'started') transport.start();
    },
  };
}
```

`src/sound/metronome.ts`:

```ts
import * as Tone from 'tone';

/** The metronome click (spec §5.4), accented on the first beat of the bar. Internal sound only. */
export class Metronome {
  private synth: Tone.Synth;

  constructor(destination: Tone.InputNode) {
    this.synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -12,
    });
    this.synth.connect(destination);
  }

  click(at: number, accent: boolean): void {
    this.synth.triggerAttackRelease(accent ? 1760 : 1320, 0.03, at, accent ? 1 : 0.6);
  }
}
```

`src/sound/master.ts` — a dry input for the click, straight to the limiter:

```ts
  /** For the metronome: no Tone filter, no reverb or delay. */
  readonly clickInput = new Tone.Gain(1);
```

and in the constructor, after `this.input.connect(limiter);`:

```ts
    this.clickInput.connect(limiter);
```

`src/ui/rhythm.ts`:

```ts
import { clampTempo, TapTempo, TEMPO_MAX, TEMPO_MIN } from '../core/clock';
import type { Settings, Store } from '../core/store';
import { h } from './dom';
import { createKnob } from './knob';

const SPAN = TEMPO_MAX - TEMPO_MIN;

/** Tempo knob and field, tap tempo and the metronome toggle (spec §5.4). */
export function createRhythm(store: Store) {
  const taps = new TapTempo();
  const setTempo = (bpm: number) => {
    if (bpm !== store.get().tempo) store.update((s) => (s.tempo = bpm));
  };
  const knob = createKnob({
    label: 'Tempo',
    value: (store.get().tempo - TEMPO_MIN) / SPAN,
    learn: 'tempo',
    onInput: (v) => setTempo(clampTempo(TEMPO_MIN + v * SPAN)),
  });
  const field = h('input', {
    type: 'number',
    min: TEMPO_MIN,
    max: TEMPO_MAX,
    'data-testid': 'tempo',
    onchange: () => setTempo(clampTempo(Number(field.value) || store.get().tempo)),
  });
  const tap = h('button', {
    type: 'button',
    'data-testid': 'tap',
    onclick: () => {
      const bpm = taps.tap(performance.now());
      if (bpm !== null) setTempo(bpm);
    },
  }, 'Tap');
  const click = h('button', {
    type: 'button',
    'data-testid': 'metronome',
    onclick: () => store.update((s) => (s.metronome = !s.metronome)),
  }, 'Click');
  const el = h(
    'div',
    { class: 'rhythm' },
    knob.el,
    h('label', { class: 'bpm' }, field, ' BPM'),
    h('div', { class: 'rhythm-buttons' }, tap, click),
  );
  return {
    el,
    render(s: Settings) {
      if (clampTempo(TEMPO_MIN + knob.value() * SPAN) !== s.tempo) knob.set((s.tempo - TEMPO_MIN) / SPAN);
      if (document.activeElement !== field) field.value = String(s.tempo);
      click.classList.toggle('active', s.metronome);
    },
  };
}
```

`src/ui/arpSettings.ts`:

```ts
import { ARP_PATTERNS, ARP_RATES, type ArpPattern, type ArpRate, type ArpSettings, type Settings, type Store } from '../core/store';
import { createSelect, h } from './dom';

const PATTERN_LABELS: Record<ArpPattern, string> = { up: 'up', down: 'down', upDown: 'up-down', random: 'random' };
const GATES = Array.from({ length: 10 }, (_, i) => (i + 1) / 10); // 10% … 100%

/** The Arp's pattern, rate, octaves and gate, shown in its module settings (spec §5.5). */
export function createArpSettings(store: Store) {
  const set = (patch: Partial<ArpSettings>) => store.update((s) => Object.assign(s.arp, patch));
  const pattern = createSelect({ 'data-testid': 'arp-pattern' }, (v) => set({ pattern: v as ArpPattern }));
  const rate = createSelect({ 'data-testid': 'arp-rate' }, (v) => set({ rate: v as ArpRate }));
  const octaves = createSelect({ 'data-testid': 'arp-octaves' }, (v) => set({ octaves: Number(v) as 1 | 2 | 3 }));
  const gate = createSelect({ 'data-testid': 'arp-gate' }, (v) => set({ gate: Number(v) }));
  const el = h(
    'div',
    { class: 'arp-settings' },
    h('label', {}, 'pattern ', pattern.el),
    h('label', { 'data-learn': 'arpRate' }, 'rate ', rate.el),
    h('label', {}, 'octaves ', octaves.el),
    h('label', {}, 'gate ', gate.el),
  );
  return {
    el,
    render(s: Settings) {
      pattern.setOptions(ARP_PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] })), s.arp.pattern);
      rate.setOptions(ARP_RATES.map((r) => ({ value: r, label: r })), s.arp.rate);
      octaves.setOptions([1, 2, 3].map((o) => ({ value: String(o), label: String(o) })), String(s.arp.octaves));
      gate.setOptions(GATES.map((g) => ({ value: String(g), label: `${Math.round(g * 100)}%` })), String(s.arp.gate));
    },
  };
}
```

`src/ui/moduleStrip.ts` — module settings can carry extra controls. Change the `deps` type, the `details` children and `render`:

```ts
type Extra = { el: HTMLElement; render(s: Settings): void };

/** A volume knob per module; the module name opens its settings. */
export function createModuleStrip(deps: {
  store: Store;
  outputNames: () => string[];
  portMissing: (id: ModuleId) => boolean;
  extras?: Partial<Record<ModuleId, Extra>>;
}) {
```

```ts
    const extra = deps.extras?.[id];
    const details = h(
      'details',
      { class: 'module-settings' },
      h('summary', { 'data-testid': `${id}-open` }, NAMES[id], badge),
      h('label', {}, enabled, ' enabled'),
      h('label', {}, sound, ' internal sound'),
      h('label', {}, 'preset ', preset.el),
      h('label', {}, 'MIDI out ', port.el),
      h('label', {}, 'channel ', channel.el),
      ...(extra ? [extra.el] : []),
    );
```

and at the end of the loop body in `render`:

```ts
        it.badge.hidden = !deps.portMissing(it.id);
        deps.extras?.[it.id]?.render(s);
```

`src/ui/panel.ts` — imports, the rhythm block under the Extensions knob, the Arp settings in the strip, and both in `render`:

```ts
import { createArpSettings } from './arpSettings';
import { createRhythm } from './rhythm';
```

```ts
  const rhythm = createRhythm(store);
  const strip = createModuleStrip({
    store,
    outputNames: () => deps.ports()?.outputNames() ?? [],
    portMissing: deps.portMissing,
    extras: { arp: createArpSettings(store) },
  });
  const panel = h(
    'main',
    { class: 'panel' },
    h('div', { class: 'controls' }, layoutButton, tonalityButton, tableButton, extKnob.el, rhythm.el),
    oled.el,
    tonal.el,
    keyboard.el,
    strip.el,
  );
```

```ts
    tonal.render(s);
    rhythm.render(s);
```

`src/ui/style.css` — append:

```css
.rhythm { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; }
.rhythm .bpm input { width: 64px; }
.rhythm-buttons { display: flex; gap: 6px; }
.arp-settings { margin-top: 6px; padding-top: 4px; border-top: 1px solid var(--panel-shade); }
```

`src/main.ts` — imports, the Arp module, the transport, the metronome and the audio-state handler. New imports:

```ts
import { PPQ, TICKS_PER_BAR } from './core/clock';
import { ArpModule } from './modules/arp';
import type { Module } from './modules/module';
import { Metronome } from './sound/metronome';
import { createTransport } from './sound/transport';
```

The module list:

```ts
const modules: Module[] = [
  new KeysModule(outputs.sink('keys')),
  new PadModule(outputs.sink('pad')),
  new BassModule(outputs.sink('bass')),
  new MelodyModule(outputs.sink('melody'), () => store.get().modStrip),
  new ArpModule(outputs.sink('arp'), () => store.get().arp),
];
bus.subscribe((e) => {
  for (const m of modules) m.handle(e);
});

const metronome = new Metronome(master.clickInput);
const transport = createTransport((tick, at, dur) => bus.emit({ type: 'tick', tick, at, dur }));
transport.setTempo(store.get().tempo);
bus.subscribe((e) => {
  if (e.type === 'tick' && e.tick % PPQ === 0 && store.get().metronome) metronome.click(e.at, e.tick % TICKS_PER_BAR === 0);
});
```

In the existing `store.subscribe` after `master.apply(next.master);`:

```ts
  if (next.tempo !== prev.tempo) transport.setTempo(next.tempo);
```

Replace the two `ui.setAudioRunning` lines after `const context = Tone.getContext();`:

```ts
const onAudioState = () => {
  const running = context.state === 'running';
  ui.setAudioRunning(running);
  if (running) transport.start();
};
onAudioState();
context.on('statechange', onAudioState);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test && npm run e2e && npm run build`
Expected: all PASS, 24 browser tests.

- [ ] **Step 5: Commit**

```bash
git add src/sound/transport.ts src/sound/metronome.ts src/sound/master.ts src/ui/rhythm.ts src/ui/arpSettings.ts \
  src/ui/moduleStrip.ts src/ui/panel.ts src/ui/style.css src/main.ts e2e/rhythm.spec.ts
git commit -m "Run the tempo clock and play the Arp, with tap tempo and a metronome"
```

---

### Task 8: Strum in the app and the mod strip setting (§4.3, §5.6, §7)

**Files:**
- Modify: `src/main.ts`, `src/ui/settings.ts`, `e2e/rhythm.spec.ts`

**Interfaces:**
- Consumes: `StrumModule`, `MelodyModule.modStripChanged()` (Task 6); `ModStripFunction` (Task 3); `noteOns`, `countStatus` in `e2e/rhythm.spec.ts` (Task 7).
- Produces: settings drawer select `data-testid="mod-strip"` (values `strum`, `vibrato`).

- [ ] **Step 1: Write the failing browser tests** — append inside `test.describe('rhythm', …)` in `e2e/rhythm.spec.ts`:

```ts
  test('the mod strip strums the held chord on channel 6; each note ends after 1.5 s', async ({ page }) => {
    await page.getByTestId('strum-open').click();
    await page.getByTestId('strum-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]); // C
    await sendMidi(page, [0xb0, 1, 0]);
    await sendMidi(page, [0xb0, 1, 127]);
    await expect.poll(() => noteOns(page, 6)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    await expect.poll(() => countStatus(page, 0x85)).toBe(7);
  });

  test('with the mod strip set to Vibrato, CC1 goes to the Melody instead', async ({ page }) => {
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await page.getByTestId('strum-open').click();
    await page.getByTestId('strum-port').selectOption(SYNTH);
    await page.getByTestId('settings-toggle').click();
    await page.getByTestId('mod-strip').selectOption('vibrato');
    await sendMidi(page, [0x90, 48, 100]);
    await sendMidi(page, [0xb0, 1, 90]);
    await expect.poll(async () => (await midiSent(page)).map((m) => m.data.join(','))).toContain('180,1,90');
    expect(await noteOns(page, 6)).toEqual([]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run e2e -- e2e/rhythm.spec.ts`
Expected: the two new tests FAIL: no channel-6 notes, and no `mod-strip` select.

- [ ] **Step 3: Implement**

`src/ui/settings.ts` — import `ModStripFunction`, add the selector under the note fields, and render it:

```ts
import { CONTROL_TARGETS, type EncoderMode, type ModStripFunction, type Settings, type Store } from '../core/store';
```

```ts
  const modStrip = createSelect({ 'data-testid': 'mod-strip' }, (v) =>
    store.update((s) => (s.modStrip = v as ModStripFunction)),
  );
```

```ts
    ...noteFields.map((f) => f.el),
    h('label', { class: 'note-field' }, 'Mod strip (CC1)', modStrip.el),
    h('h3', {}, 'Master'),
```

```ts
      modStrip.setOptions([{ value: 'strum', label: 'Strum' }, { value: 'vibrato', label: 'Vibrato' }], s.modStrip);
```

`src/main.ts` — import `StrumModule`, keep the Melody instance, add the Strum module, and tell Melody when the function changes:

```ts
import { StrumModule } from './modules/strum';
```

```ts
const melody = new MelodyModule(outputs.sink('melody'), () => store.get().modStrip);
const modules: Module[] = [
  new KeysModule(outputs.sink('keys')),
  new PadModule(outputs.sink('pad')),
  new BassModule(outputs.sink('bass')),
  melody,
  new ArpModule(outputs.sink('arp'), () => store.get().arp),
  new StrumModule(
    outputs.sink('strum'),
    () => store.get().modStrip === 'strum',
    (seconds, fn) => void setTimeout(fn, seconds * 1000),
  ),
];
```

In the existing `store.subscribe`:

```ts
  if (next.modStrip !== prev.modStrip) melody.modStripChanged();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm test && npm run e2e && npm run build`
Expected: all PASS, 26 browser tests.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/ui/settings.ts e2e/rhythm.spec.ts
git commit -m "Strum with the mod strip, switchable to Melody vibrato in Settings"
```

---

### Task 9: README and the milestone-2 hardware checklist (§9)

**Files:**
- Create: `docs/hardware-check-m2.md`
- Modify: `README.md` (Play section), `docs/hardware-check-m1.md` (vibrato item)

**Interfaces:** none.

- [ ] **Step 1: Write `docs/hardware-check-m2.md`:**

```markdown
# Hardware check — Milestone 2

Run this with the Komplete Kontrol M32 connected to Windows, as in
[the milestone-1 check](hardware-check-m1.md) (setup and troubleshooting are there). Milestone 2
stores settings under a new version, so settings changed in milestone 1 are back to their
defaults: set the split point, key-select note and learned controls again if you changed them.

## Clock

- [ ] The tempo field under the Extensions knob reads 100 BPM. Turn the Tempo knob; type 120.
- [ ] Tap **Tap** four times along with a song: the tempo follows it.
- [ ] **Click** on: a click on every beat, higher on beat 1. Click off.

## Arp

- [ ] Open **Arp**, tick *enabled*. Hold C: C E G repeat upward in eighths, in time with the click.
- [ ] Rates 1/4, 1/8T, 1/16, 1/16T: the speed follows the grid.
- [ ] Patterns *down*, *up-down* (top and bottom notes not repeated), *random*. Octaves 2 and 3
      extend the run upward. Gate 10% is staccato, 100% legato.
- [ ] Change chord while it runs: the next step uses the new chord. Release all keys: it stops.
      Press a chord again: the pattern starts from its first note.
- [ ] Arp → MIDI out Bome, channel 3: a DAW track on channel 3 receives the arpeggio.
- [ ] Hold a chord with the Arp running and click **Panic**: everything stops; nothing hangs in the DAW.

## Strum

- [ ] Hold a chord and slide along the touch strip: the chord's notes ring one by one, upward or
      downward with the slide. Release the chord: the strip plays nothing.
- [ ] Strum → Bome, channel 6: the DAW receives the strummed notes; each ends after 1.5 s.
- [ ] Settings → *Mod strip (CC1)*: Vibrato. The strip now adds vibrato to the Melody and does not
      strum. Switch back to Strum: the vibrato stops.

## MIDI learn

- [ ] Learn mode: click the Tempo knob, turn an encoder: the encoder sets the tempo. Learn the Arp
      *rate* the same way (click the word "rate" in the Arp settings).

## Record

- [ ] What the touch strip sends when it is released (nothing, or a jump to 0). A jump to 0 strums
      down to the lowest note on release; if that happens, note it for a fix.
- [ ] Whether the Arp's first note feels late after pressing a chord (it waits for the next grid step).
- [ ] Preset sounds that need tuning (`src/sound/presets.ts`): Bell, Harp.
```

- [ ] **Step 2: Update `README.md`** — in the Play section, replace the line `- Each module (Keys, Pad, Bass, Melody) can sound internally and/or go to a MIDI port and channel.` with:

```markdown
- Each module (Keys, Pad, Bass, Melody, Arp, Strum) can sound internally and/or go to a MIDI port
  and channel.
- Under the Extensions knob: Tempo (knob or field), Tap tempo, and Click (metronome).
- The Arp (enable it in its module settings) plays the held chord on the tempo grid; its pattern,
  rate, octaves and gate are in its settings.
- The mod strip (CC1) strums the held chord. Settings → Mod strip switches it to Melody vibrato.
```

and replace the final line with:

```markdown
Hardware checklists: [milestone 1](docs/hardware-check-m1.md), [milestone 2](docs/hardware-check-m2.md).
```

- [ ] **Step 3: Update `docs/hardware-check-m1.md`** — the Melody item:

```markdown
- [ ] The upper keys play the Lead. Pitch bend bends ±2 semitones. With Settings → Mod strip set
      to Vibrato (milestone 2 defaults it to Strum), the mod strip adds vibrato.
```

- [ ] **Step 4: Verify the whole suite once more**

Run: `npm run typecheck && npm test && npm run e2e && npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/hardware-check-m2.md docs/hardware-check-m1.md README.md
git commit -m "Document milestone 2 and its hardware check"
```
