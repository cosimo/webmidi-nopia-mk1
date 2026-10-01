# Nopia Web — Milestone 1 (Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build milestone 1 of the Nopia-inspired Web MIDI harmony instrument: chord engine, input routing, the Keys/Pad/Bass/Melody modules with internal sound and per-module MIDI out, master FX, the panel UI, a MIDI monitor and MIDI learn. At the end it is playable from the Komplete Kontrol M32.

**Architecture:** The core is pure TypeScript with no browser APIs: harmony, input routing, modules, settings store and output routing, all unit-tested in Vitest. Thin browser adapters (a Web MIDI wrapper, Tone.js sinks and the DOM panel) are wired together in `src/main.ts`. Playwright drives the real page through an injected fake Web MIDI. Data flows: MIDI in → `InputRouter` → `ChordEngine` / bus → modules → `FanoutSink` → `ToneSink` and/or `MidiOutSink`.

**Tech Stack:** TypeScript 7, Vite 8, Tone.js 15, Vitest 5, Playwright 1.63. No UI framework.

**Spec:** `docs/superpowers/specs/2026-10-01-nopia-web-design.md` (milestone 1 = spec §2 item 1). Read it alongside this plan.

## Global Constraints

- Target browsers: desktop Chrome/Edge (Web MIDI). Firefox may work; Safari is unsupported.
- Dev server runs in WSL2 and is opened from Windows Chrome/Edge at `http://localhost:5173` (localhost is a secure context, which Web MIDI requires). Vite listens on `127.0.0.1:5173` with `strictPort`.
- `src/harmony/`, `src/core/`, `src/modules/`, `src/input/controlMap.ts`, `src/input/inputRouter.ts`, `src/sound/midiOutSink.ts`, `src/sound/moduleOutputs.ts`, `src/sound/monoNotes.ts` must not touch browser APIs or import Tone.js, so they stay testable in Node.
- Stack: TypeScript, Vite, Tone.js, Vitest, Playwright. No UI framework: plain DOM + CSS.
- Every default that depends on the M32 can be changed from the UI: split point 60, key-select note 79, encoder bindings CC 14–21 on channel 1.
- No stuck notes: panic, hiding the page, or losing the input stops every module's notes, internal and MIDI (explicit note-offs plus CC123).
- MIDI out is off for every module until a port is chosen. Channels: Keys 1, Bass 2, Pad 4, Melody 5.
- Settings persist in localStorage under `nopia-web.settings.v1`. Invalid or unreadable data falls back to the defaults.
- Tone.js context uses `latencyHint: 'interactive'`; live notes start at `Tone.immediate()`; MIDI is sent immediately.
- Commit after every task (the user wants small, logical commits). Follow the harness's commit-attribution rules.
- Node 24 / npm 11 (as installed in WSL).

## Decisions and Deviations from the Spec

These were settled while planning. Each is small and reversible:

1. **`Chord.fn`**: `Chord` gains `fn: string`, the OLED's function line: `'V7/ii → Dm'` for secondary dominants, otherwise `'diatonic'` or `'borrowed'`.
2. **`Tone.immediate()` instead of `Tone.now()`** (spec §5.3). `Tone.now()` adds the context's 0.1 s lookAhead, which would delay every note by 100 ms. `immediate()` is the AudioContext's current time. The lookAhead stays at its default so M2's Transport scheduling still works.
3. **Sinks take no `time` in M1.** `NoteSink.noteOn(note, velocity)` plays immediately. M2 adds a time parameter when the Arp schedules notes on the grid.
4. **Deferred to M2/M3:** the `param` and `tick` bus events, the Arp/Strum modules and their volume targets, and the "Mod strip function" setting (M1 has only Vibrato, so a one-option selector would be pointless).
5. **Module volume over MIDI:** a module's volume is also sent as CC7 on its MIDI channel, so the volume knobs work for external synths too.
6. **Glide:** the Melody's "optional glide" is a preset, `Lead (glide)`.
7. **Header MIDI-out selector:** it assigns a port to all modules at once and shows `(per module)` when they differ. Each module's settings can override it.
8. **Input choice:** if the stored input is connected, use it. If a stored input is missing, select nothing and show "Connect a keyboard" rather than grabbing another device. If nothing is stored, use the first input whose name does not contain "DAW".
9. **Enabled is applied in routing.** A disabled module still follows chords (so the Keys and Pad voicers stay in step), but its notes go nowhere.
10. **Retrigger rule (§3.8):** a chord change caused by a key press or release retriggers every note. A settings change keeps common notes sounding.
11. **Voicing interpretation (§3.7):** "first chord" means root position with the root in [52, 64). Voice-leading memory survives silence and resets on panic.
12. **Encoder detection (§4.3):** a binding stays in `detect` mode until 8 values have arrived. Meanwhile, values that could be relative are applied as relative, and the first value outside 1–10 / 118–127 locks the binding to absolute. In relative mode, Extensions moves one level every 8 ticks.
13. **Polyphony:** Tone PolySynths use `maxPolyphony = 64`. The Pad's 2.5 s release overlaps many chords, and 24 voices dropped notes at 4 chords per second (measured).

## Review Focus

Failure modes the spec implies but does not spell out, most likely first. Each one has a pinning test in the task that owns the code:

1. **Losing focus or the keyboard mid-chord**: hiding the tab or unplugging the M32 while holding chords must stop every note, internal and MIDI. Tests: Task 15, `hiding the page silences held notes` and `unplugging the input silences held notes`.
2. **Fast chord changes with long releases**: changing chords about 4 times a second at full extensions must not hit the synth's voice cap and drop notes. Test: Task 15, `fast chord changes at full extensions never drop notes`.
3. **The same note twice without a note-off**: clicking an on-screen key while the hardware key is held, or a keyboard that repeats note-ons, must not leave a stuck chord. Test: Task 9, `a repeated note-on for a held note releases it first`.
4. **Key-select note moved into the chord zone**: if the user sets the key-select note below the split point, it must stay reserved and never sound. Test: Task 9, `keeps a key-select note below the split reserved`.
5. **Turning a knob while the sustain pedal holds a released chord**: the chord must re-voice live and still end when the pedal lifts. Test: Task 6, `recomputes a sustained chord on settings changes and still ends it on pedal up`.

---

## File Map

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts` | Toolchain; Vitest config lives in `vite.config.ts` |
| `playwright.config.ts`, `e2e/fakeMidi.ts` | Browser tests; fake `navigator.requestMIDIAccess` |
| `e2e/play.spec.ts`, `e2e/modules.spec.ts`, `e2e/settings.spec.ts` | Browser tests for Tasks 14, 15 and 16 |
| `index.html`, `src/main.ts` | Page shell; composition root that wires everything together |
| `src/harmony/theory.ts` | Types (`PitchClass`, `Chord`, `ChordRow`, `HarmonySettings` …), `pc()`, scales, `midiNoteName()` |
| `src/harmony/spelling.ts` | Tonic names; root spelling by scale-degree letter (§3.6) |
| `src/harmony/extensions.ts` | Extension intervals and name suffixes (§3.5) |
| `src/harmony/tables.ts` | Secondary-dominant and borrowed tables (§3.2–3.3) |
| `src/harmony/chordEngine.ts` | Key→row mapping, `chordForKey()`, and the stateful held-key `ChordEngine` (§3.4, §3.8) |
| `src/harmony/voicing.ts` | `Voicer` (Keys voice leading), `padVoicing()`, `bassNote()` (§3.7) |
| `src/core/bus.ts` | Typed, timestamped event bus |
| `src/core/store.ts` | Settings schema, defaults, validation, persistence |
| `src/input/controlMap.ts` | MIDI learn, encoder-mode detection, CC→settings |
| `src/input/inputRouter.ts` | Split, key-select, sustain, pitch bend, CC routing, press-a-key capture |
| `src/input/midiAccess.ts` | Web MIDI wrapper: ports, input selection, hot-plug |
| `src/modules/module.ts` | `NoteSink`, `Module`, `ChordModule` base |
| `src/modules/keys.ts`, `pad.ts`, `bass.ts`, `melody.ts` | The four M1 modules |
| `src/modules/testSink.ts` | `FakeSink` used by module tests |
| `src/sound/midiOutSink.ts` | Per-module MIDI output with note tracking |
| `src/sound/moduleOutputs.ts` | `FanoutSink`, per-module routing, port-missing fallback |
| `src/sound/monoNotes.ts` | Last-note priority for monophonic synths |
| `src/sound/presets.ts` | Tone.js instrument presets |
| `src/sound/toneSink.ts` | Internal-sound sink (voice → vibrato → volume) |
| `src/sound/master.ts` | Tone low-pass, reverb/delay sends, limiter, master volume |
| `src/ui/*.ts`, `src/ui/style.css` | DOM panel: knobs, OLED, tonal selector, keyboard, module strip, settings drawer, MIDI monitor |
| `docs/hardware-check-m1.md` | The user's hardware checklist |

---
### Task 1: Project scaffold and harmony theory basics

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`
- Create: `src/harmony/theory.ts`
- Test: `src/harmony/theory.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: types `PitchClass`, `Tonality`, `LayoutMode`, `TableId`, `ExtFamily`, `Triad`, `ExtLevel`, `ChordRow`, `Chord` (`{root, intervals, name, roman, fn, row}`), `HarmonySettings` (`{tonic, tonality, layout, table, extLevel}`); `TRIAD_INTERVALS`, `SCALE`, `pc(n)`, `midiNoteName(note)`. Scripts `npm test`, `npm run typecheck`, `npm run dev`, `npm run build`.

- [ ] **Step 1: Create the project files**

Create `package.json`:

```json
{
  "name": "nopia-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
```

The existing `.gitignore` already covers `node_modules/`, `dist/`, `test-results/`, `playwright-report/` and `.vite/`.

- [ ] **Step 2: Install the toolchain**

```bash
npm install -D vite@^8.3.2 typescript@^7.0.2 vitest@^5.0.3
```
Expected: `added … packages`, and `package.json` gains `devDependencies`.

- [ ] **Step 3: Write the failing test**

Create `src/harmony/theory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { midiNoteName, pc } from './theory';

describe('pc', () => {
  it('wraps any integer into 0..11', () => {
    expect(pc(0)).toBe(0);
    expect(pc(13)).toBe(1);
    expect(pc(-1)).toBe(11);
    expect(pc(-13)).toBe(11);
  });
});

describe('midiNoteName', () => {
  it('names notes with octave, middle C = C4', () => {
    expect(midiNoteName(60)).toBe('C4');
    expect(midiNoteName(48)).toBe('C3');
    expect(midiNoteName(79)).toBe('G5');
    expect(midiNoteName(61)).toBe('C♯4');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run src/harmony/theory.test.ts`
Expected: FAIL — `Error: Cannot find module './theory'`

- [ ] **Step 5: Implement theory.ts**

Create `src/harmony/theory.ts`:

```ts
export type PitchClass = number; // 0..11, C = 0
export type Tonality = 'major' | 'minor';
export type LayoutMode = 'real' | 'static';
export type TableId = 'secdom' | 'borrowed';
export type ExtFamily = 'maj' | 'dom' | 'sec' | 'secb9' | 'min' | 'minPhr' | 'dim' | 'dim7';
export type Triad = 'maj' | 'min' | 'dim';
export type ExtLevel = 0 | 1 | 2 | 3;

export interface ChordRow {
  rootOffset: number; // semitones above tonic
  rootDegree: number; // 1..7 scale-degree letter, used for spelling
  triad: Triad;
  family: ExtFamily;
  roman: string; // e.g. 'ii', 'V7/ii', '♭VII'
}

export interface Chord {
  root: PitchClass;
  intervals: number[]; // semitones above root, triad + extensions
  name: string; // e.g. 'Dm9', 'A7♭9'
  roman: string;
  fn: string; // e.g. 'V7/ii → Dm', 'diatonic', 'borrowed'
  row: number; // 0..11, the table row that produced it
}

export interface HarmonySettings {
  tonic: PitchClass;
  tonality: Tonality;
  layout: LayoutMode;
  table: TableId;
  extLevel: ExtLevel;
}

export const TRIAD_INTERVALS: Record<Triad, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

/** Semitone offsets of the scale degrees above the tonic. */
export const SCALE: Record<Tonality, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export function pc(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** MIDI note number to a display name, e.g. 60 → 'C4'. */
export function midiNoteName(note: number): string {
  return `${SHARP_NAMES[pc(note)]}${Math.floor(note / 12) - 1}`;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/harmony/theory.test.ts && npm run typecheck`
Expected: PASS (2 tests); `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts src/harmony/theory.ts src/harmony/theory.test.ts
git commit -m "Scaffold Vite + TypeScript project with harmony theory basics"
```

---

### Task 2: Root spelling and tonic names (§3.6)

**Files:**
- Create: `src/harmony/spelling.ts`
- Test: `src/harmony/spelling.test.ts`

**Interfaces:**
- Consumes: `pc`, `PitchClass`, `Tonality` from `theory.ts`
- Produces: `TONIC_NAMES: Record<Tonality, string[]>` (indexed by pitch class); `spellRoot(tonic, tonality, rootDegree, root): string` (letter + accidental: ♭ ♯ 𝄫 𝄪; throws if more than a double accidental would be needed).

- [ ] **Step 1: Write the failing test**

Create `src/harmony/spelling.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spellRoot, TONIC_NAMES } from './spelling';

describe('TONIC_NAMES', () => {
  it('matches the Tonal Selector names in the spec', () => {
    expect(TONIC_NAMES.major.join(' ')).toBe('C D♭ D E♭ E F F♯ G A♭ A B♭ B');
    expect(TONIC_NAMES.minor.join(' ')).toBe('C C♯ D E♭ E F F♯ G G♯ A B♭ B');
  });
});

describe('spellRoot', () => {
  it('spells the tonic itself with its selector name', () => {
    for (const tonality of ['major', 'minor'] as const) {
      for (let t = 0; t < 12; t++) {
        expect(spellRoot(t, tonality, 1, t)).toBe(TONIC_NAMES[tonality][t]);
      }
    }
  });

  it('spells ♭III of C major as E♭, not D♯', () => {
    expect(spellRoot(0, 'major', 3, 3)).toBe('E♭');
  });

  it('spells V7/ii of C major as A', () => {
    expect(spellRoot(0, 'major', 6, 9)).toBe('A');
  });

  it('uses double sharps where the letter rule needs them', () => {
    // ♯iv° in C♯ minor: F𝄪
    expect(spellRoot(1, 'minor', 4, 7)).toBe('F𝄪');
  });

  it('uses double flats where the letter rule needs them', () => {
    // ♭VI in D♭ major: B𝄫
    expect(spellRoot(1, 'major', 6, 9)).toBe('B𝄫');
  });

  it('spells the major-key degrees of F♯ major', () => {
    const degrees = [0, 2, 4, 5, 7, 9, 11];
    const names = degrees.map((off, i) => spellRoot(6, 'major', i + 1, (6 + off) % 12));
    expect(names.join(' ')).toBe('F♯ G♯ A♯ B C♯ D♯ E♯');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/harmony/spelling.test.ts`
Expected: FAIL — `Error: Cannot find module './spelling'`

- [ ] **Step 3: Implement spelling.ts**

Create `src/harmony/spelling.ts`:

```ts
import { pc, type PitchClass, type Tonality } from './theory';

/** Tonic names offered by the Tonal Selector, indexed by pitch class. */
export const TONIC_NAMES: Record<Tonality, string[]> = {
  major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
  minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/**
 * Spell a chord root by scale-degree letter: letter = tonic letter + (rootDegree − 1),
 * with the accidental chosen to hit `root`.
 */
export function spellRoot(
  tonic: PitchClass,
  tonality: Tonality,
  rootDegree: number,
  root: PitchClass,
): string {
  const tonicLetter = LETTERS.indexOf(TONIC_NAMES[tonality][tonic][0]);
  const letter = (tonicLetter + rootDegree - 1) % 7;
  let diff = pc(root - NATURAL_PC[letter]);
  if (diff > 6) diff -= 12;
  const accidental = ACCIDENTALS[diff];
  if (accidental === undefined) {
    throw new Error(`cannot spell pc ${root} on letter ${LETTERS[letter]}`);
  }
  return LETTERS[letter] + accidental;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/harmony/spelling.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/harmony/spelling.ts src/harmony/spelling.test.ts
git commit -m "Spell chord roots by scale-degree letter"
```

---

### Task 3: Extensions and chord-name suffixes (§3.5)

**Files:**
- Create: `src/harmony/extensions.ts`
- Test: `src/harmony/extensions.test.ts`

**Interfaces:**
- Consumes: `ExtFamily`, `ExtLevel` from `theory.ts`
- Produces: `EXTENSIONS`, `SUFFIXES`, `extensionIntervals(family, level): number[]`, `chordSuffix(family, level): string`.

- [ ] **Step 1: Write the failing test**

Create `src/harmony/extensions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chordSuffix, extensionIntervals } from './extensions';
import type { ExtFamily, ExtLevel } from './theory';

const FAMILIES: ExtFamily[] = ['maj', 'dom', 'sec', 'secb9', 'min', 'minPhr', 'dim', 'dim7'];
const LEVELS: ExtLevel[] = [0, 1, 2, 3];

describe('extensionIntervals', () => {
  it('adds nothing at level 0 except the 7th of secondary dominants', () => {
    expect(extensionIntervals('maj', 0)).toEqual([]);
    expect(extensionIntervals('min', 0)).toEqual([]);
    expect(extensionIntervals('sec', 0)).toEqual([10]);
    expect(extensionIntervals('secb9', 0)).toEqual([10]);
  });

  it('gives secb9 the ♭9 and ♭13, sec the natural 9 and 13', () => {
    expect(extensionIntervals('secb9', 3)).toEqual([10, 13, 20]);
    expect(extensionIntervals('sec', 3)).toEqual([10, 14, 21]);
  });

  it('gives the phrygian minor and half-diminished an 11th instead of a 9th', () => {
    expect(extensionIntervals('minPhr', 2)).toEqual([10, 17]);
    expect(extensionIntervals('dim', 3)).toEqual([10, 17]);
  });

  it('never adds tones at or below the triad, and never repeats one', () => {
    for (const f of FAMILIES) {
      for (const l of LEVELS) {
        const ivs = extensionIntervals(f, l);
        expect(new Set(ivs).size).toBe(ivs.length);
        for (const i of ivs) expect(i).toBeGreaterThan(7);
      }
    }
  });
});

describe('chordSuffix', () => {
  it('names extended chords', () => {
    expect(chordSuffix('maj', 2)).toBe('maj9');
    expect(chordSuffix('min', 3)).toBe('m11');
    expect(chordSuffix('secb9', 3)).toBe('7♭9♭13');
    expect(chordSuffix('dim', 1)).toBe('ø7');
    expect(chordSuffix('dim7', 1)).toBe('°7');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/harmony/extensions.test.ts`
Expected: FAIL — `Error: Cannot find module './extensions'`

- [ ] **Step 3: Implement extensions.ts**

The tables are copied verbatim from spec §3.5.

Create `src/harmony/extensions.ts`:

```ts
import type { ExtFamily, ExtLevel } from './theory';

/** Intervals added on top of the triad, by family and extension level (spec §3.5). */
export const EXTENSIONS: Record<ExtFamily, number[][]> = {
  maj: [[], [11], [11, 14], [11, 14, 21]],
  dom: [[], [10], [10, 14], [10, 14, 21]],
  sec: [[10], [10], [10, 14], [10, 14, 21]],
  secb9: [[10], [10], [10, 13], [10, 13, 20]],
  min: [[], [10], [10, 14], [10, 14, 17]],
  minPhr: [[], [10], [10, 17], [10, 17]],
  dim: [[], [10], [10, 17], [10, 17]],
  dim7: [[], [9], [9], [9]],
};

/** Chord-name suffixes, by family and extension level (spec §3.5). */
export const SUFFIXES: Record<ExtFamily, string[]> = {
  maj: ['', 'maj7', 'maj9', 'maj13'],
  dom: ['', '7', '9', '13'],
  sec: ['7', '7', '9', '13'],
  secb9: ['7', '7', '7♭9', '7♭9♭13'],
  min: ['m', 'm7', 'm9', 'm11'],
  minPhr: ['m', 'm7', 'm7(11)', 'm7(11)'],
  dim: ['°', 'ø7', 'ø7(11)', 'ø7(11)'],
  dim7: ['°', '°7', '°7', '°7'],
};

export function extensionIntervals(family: ExtFamily, level: ExtLevel): number[] {
  return EXTENSIONS[family][level];
}

export function chordSuffix(family: ExtFamily, level: ExtLevel): string {
  return SUFFIXES[family][level];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/harmony/extensions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/harmony/extensions.ts src/harmony/extensions.test.ts
git commit -m "Add chord extension intervals and name suffixes"
```

---

### Task 4: Chord tables and key → chord mapping (§3.2–3.4)

**Files:**
- Create: `src/harmony/tables.ts`
- Create: `src/harmony/chordEngine.ts` (pure functions; Task 6 adds the stateful class)
- Test: `src/harmony/chordEngine.test.ts`

**Interfaces:**
- Consumes: `theory.ts` types and `SCALE`/`TRIAD_INTERVALS`/`pc`; `spellRoot` (Task 2); `extensionIntervals`, `chordSuffix` (Task 3)
- Produces: `TABLES[tableId][tonality]: ChordRow[12]`; `rowForKey(keyPc, settings): number`; `chordForRow(row, settings): Chord`; `chordForKey(keyPc, settings): Chord`.

- [ ] **Step 1: Write the failing test**

The expected names in the first four tests are the spec tables §3.2–3.3, read row by row.

Create `src/harmony/chordEngine.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chordForKey, chordForRow, rowForKey } from './chordEngine';
import { TABLES } from './tables';
import { pc, SCALE, type HarmonySettings, type TableId, type Tonality } from './theory';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const TONALITIES: Tonality[] = ['major', 'minor'];
const TABLE_IDS: TableId[] = ['secdom', 'borrowed'];

function names(s: Partial<HarmonySettings>): string[] {
  const settings = { ...base, ...s };
  return Array.from({ length: 12 }, (_, row) => chordForRow(row, settings).name);
}

describe('spec tables at extension level 0', () => {
  it('secdom, C major (§3.2)', () => {
    expect(names({ tonic: 0, tonality: 'major', table: 'secdom' })).toEqual(
      ['C', 'A7', 'Dm', 'B7', 'Em', 'F', 'D7', 'G', 'E7', 'Am', 'C7', 'B°'],
    );
  });

  it('secdom, A minor (§3.2)', () => {
    expect(names({ tonic: 9, tonality: 'minor', table: 'secdom' })).toEqual(
      ['Am', 'C7', 'B°', 'C', 'A7', 'Dm', 'B7', 'Em', 'F', 'D7', 'G', 'E7'],
    );
  });

  it('borrowed, C major (§3.3)', () => {
    expect(names({ tonic: 0, tonality: 'major', table: 'borrowed' })).toEqual(
      ['C', 'D♭', 'Dm', 'E♭', 'Em', 'F', 'F♯°', 'G', 'A♭', 'Am', 'B♭', 'B°'],
    );
  });

  it('borrowed, A minor (§3.3)', () => {
    expect(names({ tonic: 9, tonality: 'minor', table: 'borrowed' })).toEqual(
      ['Am', 'B♭', 'B°', 'C', 'C♯m', 'Dm', 'D♯°', 'Em', 'F', 'F♯m', 'G', 'G♯°'],
    );
  });

  it('roman numerals, secdom C major', () => {
    const romans = Array.from({ length: 12 }, (_, row) => chordForRow(row, base).roman);
    expect(romans).toEqual(
      ['I', 'V7/ii', 'ii', 'V7/iii', 'iii', 'IV', 'V7/V', 'V', 'V7/vi', 'vi', 'V7/IV', 'vii°'],
    );
  });
});

describe('every tonic × tonality × table', () => {
  it('diatonic rows are identical in both tables', () => {
    for (const tonality of TONALITIES) {
      for (const row of SCALE[tonality]) {
        expect(TABLES.borrowed[tonality][row]).toEqual(TABLES.secdom[tonality][row]);
      }
    }
  });

  it('transposes: the root is tonic + rootOffset and the name spells that root', () => {
    const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const ACC: Record<string, number> = { '𝄫': -2, '♭': -1, '♯': 1, '𝄪': 2 };
    for (const tonality of TONALITIES) {
      for (const table of TABLE_IDS) {
        for (let tonic = 0; tonic < 12; tonic++) {
          for (let row = 0; row < 12; row++) {
            const chord = chordForRow(row, { ...base, tonic, tonality, table });
            expect(chord.root).toBe(pc(tonic + TABLES[table][tonality][row].rootOffset));
            const m = /^([A-G])(𝄫|♭|♯|𝄪)?/u.exec(chord.name)!;
            expect(pc(LETTER_PC[m[1]] + (m[2] ? ACC[m[2]] : 0))).toBe(chord.root);
          }
        }
      }
    }
  });

  it('spells other keys by scale degree', () => {
    expect(names({ tonic: 3, tonality: 'major', table: 'borrowed' })).toEqual(
      ['E♭', 'F♭', 'Fm', 'G♭', 'Gm', 'A♭', 'A°', 'B♭', 'C♭', 'Cm', 'D♭', 'D°'],
    );
    expect(names({ tonic: 1, tonality: 'minor', table: 'borrowed' })[6]).toBe('F𝄪°');
    expect(names({ tonic: 2, tonality: 'major', table: 'secdom' })).toEqual(
      ['D', 'B7', 'Em', 'C♯7', 'F♯m', 'G', 'E7', 'A', 'F♯7', 'Bm', 'D7', 'C♯°'],
    );
  });
});

describe('rowForKey (§3.4)', () => {
  it('real mode: row = key − tonic', () => {
    expect(rowForKey(2, { ...base, tonic: 2 })).toBe(0);
    expect(rowForKey(0, { ...base, tonic: 2 })).toBe(10);
  });

  it('static major: the C key is always I', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      expect(rowForKey(0, { ...base, layout: 'static', tonic })).toBe(0);
    }
  });

  it('static minor: the A key is always i', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      expect(rowForKey(9, { ...base, layout: 'static', tonality: 'minor', tonic })).toBe(0);
    }
  });

  it('static mode: white keys always give the diatonic chords', () => {
    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    for (const tonality of TONALITIES) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const s = { ...base, layout: 'static' as const, tonality, tonic };
        const rows = WHITE.map((k) => rowForKey(k, s)).sort((a, b) => a - b);
        expect(rows).toEqual([...SCALE[tonality]].sort((a, b) => a - b));
      }
    }
  });
});

describe('chordForKey', () => {
  it('plays the same chords in real and static mode in C major / A minor', () => {
    for (const tonality of TONALITIES) {
      for (const table of TABLE_IDS) {
        const tonic = tonality === 'major' ? 0 : 9;
        for (let key = 0; key < 12; key++) {
          const real = chordForKey(key, { ...base, tonality, table, tonic, layout: 'real' });
          const stat = chordForKey(key, { ...base, tonality, table, tonic, layout: 'static' });
          expect(stat.name).toBe(real.name);
        }
      }
    }
  });

  it('static mode in D major: the C key plays D, the G key plays A', () => {
    const s = { ...base, tonic: 2, layout: 'static' as const };
    expect(chordForKey(0, s).name).toBe('D');
    expect(chordForKey(7, s).name).toBe('A');
  });

  it('builds intervals from triad + extensions', () => {
    const dm9 = chordForKey(2, { ...base, extLevel: 2 });
    expect(dm9.name).toBe('Dm9');
    expect(dm9.intervals).toEqual([0, 3, 7, 10, 14]);
    const a7b9 = chordForKey(1, { ...base, extLevel: 2 });
    expect(a7b9.name).toBe('A7♭9');
    expect(a7b9.intervals).toEqual([0, 4, 7, 10, 13]);
  });

  it('describes the function of each chord', () => {
    expect(chordForKey(1, base).fn).toBe('V7/ii → Dm');
    expect(chordForKey(8, { ...base, tonic: 9, tonality: 'minor' }).fn).toBe('V7 → Am');
    expect(chordForKey(2, base).fn).toBe('diatonic');
    expect(chordForKey(3, { ...base, table: 'borrowed' }).fn).toBe('borrowed');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/harmony/chordEngine.test.ts`
Expected: FAIL — `Error: Cannot find module './chordEngine'`

- [ ] **Step 3: Write the tables**

Row index = semitones from the tonic to the pressed key. `rootDegree` is the scale-degree letter used for spelling (e.g. A7 in C major is degree 6).

Create `src/harmony/tables.ts`:

```ts
import type { ChordRow, ExtFamily, TableId, Tonality, Triad } from './theory';

function r(rootOffset: number, rootDegree: number, triad: Triad, family: ExtFamily, roman: string): ChordRow {
  return { rootOffset, rootDegree, triad, family, roman };
}

// Secondary-dominant table (spec §3.2). Index = row = semitones from tonic to the pressed key.
const SECDOM_MAJOR: ChordRow[] = [
  r(0, 1, 'maj', 'maj', 'I'),
  r(9, 6, 'maj', 'secb9', 'V7/ii'),
  r(2, 2, 'min', 'min', 'ii'),
  r(11, 7, 'maj', 'secb9', 'V7/iii'),
  r(4, 3, 'min', 'minPhr', 'iii'),
  r(5, 4, 'maj', 'maj', 'IV'),
  r(2, 2, 'maj', 'sec', 'V7/V'),
  r(7, 5, 'maj', 'dom', 'V'),
  r(4, 3, 'maj', 'secb9', 'V7/vi'),
  r(9, 6, 'min', 'min', 'vi'),
  r(0, 1, 'maj', 'sec', 'V7/IV'),
  r(11, 7, 'dim', 'dim', 'vii°'),
];

const SECDOM_MINOR: ChordRow[] = [
  r(0, 1, 'min', 'min', 'i'),
  r(3, 3, 'maj', 'sec', 'V7/VI'),
  r(2, 2, 'dim', 'dim', 'ii°'),
  r(3, 3, 'maj', 'maj', 'III'),
  r(0, 1, 'maj', 'secb9', 'V7/iv'),
  r(5, 4, 'min', 'min', 'iv'),
  r(2, 2, 'maj', 'secb9', 'V7/V'),
  r(7, 5, 'min', 'minPhr', 'v'),
  r(8, 6, 'maj', 'maj', 'VI'),
  r(5, 4, 'maj', 'sec', 'V7/VII'),
  r(10, 7, 'maj', 'dom', 'VII'),
  r(7, 5, 'maj', 'secb9', 'V7'),
];

// Borrowed table (spec §3.3): diatonic rows as above, chromatic rows replaced.
const BORROWED_MAJOR: ChordRow[] = SECDOM_MAJOR.map((row, i) => {
  switch (i) {
    case 1: return r(1, 2, 'maj', 'maj', '♭II');
    case 3: return r(3, 3, 'maj', 'maj', '♭III');
    case 6: return r(6, 4, 'dim', 'dim', '♯iv°');
    case 8: return r(8, 6, 'maj', 'maj', '♭VI');
    case 10: return r(10, 7, 'maj', 'dom', '♭VII');
    default: return row;
  }
});

const BORROWED_MINOR: ChordRow[] = SECDOM_MINOR.map((row, i) => {
  switch (i) {
    case 1: return r(1, 2, 'maj', 'maj', '♭II');
    case 4: return r(4, 3, 'min', 'minPhr', 'iii');
    case 6: return r(6, 4, 'dim', 'dim7', '♯iv°');
    case 9: return r(9, 6, 'min', 'min', 'vi');
    case 11: return r(11, 7, 'dim', 'dim7', 'vii°');
    default: return row;
  }
});

export const TABLES: Record<TableId, Record<Tonality, ChordRow[]>> = {
  secdom: { major: SECDOM_MAJOR, minor: SECDOM_MINOR },
  borrowed: { major: BORROWED_MAJOR, minor: BORROWED_MINOR },
};
```

- [ ] **Step 4: Write the mapping functions**

`describeFunction` finds a secondary dominant's target a fourth above its root (e.g. A7 → D) among the diatonic rows, which are identical in both tables.

Create `src/harmony/chordEngine.ts`:

```ts
import { chordSuffix, extensionIntervals } from './extensions';
import { spellRoot } from './spelling';
import { TABLES } from './tables';
import {
  pc,
  SCALE,
  TRIAD_INTERVALS,
  type Chord,
  type ChordRow,
  type ExtLevel,
  type HarmonySettings,
  type PitchClass,
  type Tonality,
} from './theory';

/** Table row for a chord key with pitch class `keyPc` (spec §3.4). */
export function rowForKey(keyPc: PitchClass, s: HarmonySettings): number {
  if (s.layout === 'real') return pc(keyPc - s.tonic);
  return s.tonality === 'major' ? pc(keyPc) : pc(keyPc - 9);
}

function chordName(s: { tonic: PitchClass; tonality: Tonality }, row: ChordRow, level: ExtLevel): string {
  const root = pc(s.tonic + row.rootOffset);
  return spellRoot(s.tonic, s.tonality, row.rootDegree, root) + chordSuffix(row.family, level);
}

function describeFunction(s: HarmonySettings, row: ChordRow, index: number): string {
  if (row.family === 'sec' || row.family === 'secb9') {
    const targetRow = TABLES.secdom[s.tonality][pc(row.rootOffset + 5)];
    return `${row.roman} → ${chordName(s, targetRow, 0)}`;
  }
  return SCALE[s.tonality].includes(index) ? 'diatonic' : 'borrowed';
}

export function chordForRow(index: number, s: HarmonySettings): Chord {
  const row = TABLES[s.table][s.tonality][index];
  return {
    root: pc(s.tonic + row.rootOffset),
    intervals: [...TRIAD_INTERVALS[row.triad], ...extensionIntervals(row.family, s.extLevel)],
    name: chordName(s, row, s.extLevel),
    roman: row.roman,
    fn: describeFunction(s, row, index),
    row: index,
  };
}

export function chordForKey(keyPc: PitchClass, s: HarmonySettings): Chord {
  return chordForRow(rowForKey(keyPc, s), s);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/harmony/chordEngine.test.ts && npm run typecheck`
Expected: PASS (16 tests); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/harmony/tables.ts src/harmony/chordEngine.ts src/harmony/chordEngine.test.ts
git commit -m "Add chord tables and key-to-chord mapping for real and static modes"
```

---

### Task 5: Voicing: Keys voice leading, Pad, Bass (§3.7)

**Files:**
- Create: `src/harmony/voicing.ts`
- Test: `src/harmony/voicing.test.ts`

**Interfaces:**
- Consumes: `Chord`, `pc` (Task 1); `chordForKey` (Task 4) in tests
- Produces: `class Voicer { next(chord): number[]; reset(): void }` (MIDI notes ascending); `padVoicing(keys: number[]): number[]`; `bassNote(chord): number`.

- [ ] **Step 1: Write the failing test**

The tie-break and drift-guard cases were found by exhaustive search, so they really exercise those branches: C7 → Em has two cost-1 candidates; Em → Dm's nearest voicing has mean 53.3 < 55.

Create `src/harmony/voicing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chordForKey } from './chordEngine';
import type { Chord, ExtLevel, HarmonySettings } from './theory';
import { bassNote, padVoicing, Voicer } from './voicing';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number, extLevel: ExtLevel = 0): Chord => chordForKey(key, { ...base, extLevel });
const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

describe('Voicer', () => {
  it('places the first chord in root position with the root in [52, 64)', () => {
    expect(new Voicer().next(chord(0))).toEqual([60, 64, 67]); // C
    expect(new Voicer().next(chord(4))).toEqual([52, 55, 59]); // Em
    expect(new Voicer().next(chord(11))).toEqual([59, 62, 65]); // B°
  });

  it('folds tensions into the octave and drops the 5th above 4 notes', () => {
    // Cmaj9 = C E G B D → C D E B (no G)
    expect(new Voicer().next(chord(0, 2))).toEqual([60, 62, 64, 71]);
    // A7 (4 notes) keeps its 5th
    expect(new Voicer().next(chord(1))).toEqual([57, 61, 64, 67]);
  });

  it('voice-leads to the nearest inversion', () => {
    const v = new Voicer();
    v.next(chord(0)); // C: 60 64 67
    expect(v.next(chord(5))).toEqual([60, 65, 69]); // F, second inversion
    expect(v.next(chord(7))).toEqual([59, 62, 67]); // G first inversion: B D G
  });

  it('breaks cost ties toward the lower register', () => {
    const v = new Voicer();
    v.next(chord(10)); // C7: 60 64 67 70
    // Em: [59 64 67] and [64 67 71] both cost 1 → the lower one wins
    expect(v.next(chord(4))).toEqual([59, 64, 67]);
  });

  it('keeps every voicing in [48, 79] and its mean in [55, 70]', () => {
    const v = new Voicer();
    for (let i = 0; i < 500; i++) {
      const notes = v.next(chord((i * 7 + (i % 5)) % 12, (i % 4) as ExtLevel));
      expect(Math.min(...notes)).toBeGreaterThanOrEqual(48);
      expect(Math.max(...notes)).toBeLessThanOrEqual(79);
      expect(mean(notes)).toBeGreaterThanOrEqual(55);
      expect(mean(notes)).toBeLessThanOrEqual(70);
    }
  });

  it('falls back to the first-chord placement when the mean drifts out of [55, 70]', () => {
    const v = new Voicer();
    expect(v.next(chord(4))).toEqual([52, 55, 59]); // Em
    // nearest Dm is [50 53 57], mean 53.3 < 55 → root position from [52, 64) instead
    expect(v.next(chord(2))).toEqual([62, 65, 69]);
  });

  it('reset() forgets the previous voicing', () => {
    const v = new Voicer();
    v.next(chord(0));
    v.next(chord(5));
    v.reset();
    expect(v.next(chord(5))).toEqual([53, 57, 60]);
  });
});

describe('padVoicing', () => {
  it('opens the voicing and lifts it an octave', () => {
    expect(padVoicing([60, 64, 67])).toEqual([72, 79, 88]);
    expect(padVoicing([57, 61, 64, 67])).toEqual([69, 76, 79, 85]);
  });
});

describe('bassNote', () => {
  it('puts the root in [36, 47]', () => {
    expect(bassNote(chord(0))).toBe(36);
    expect(bassNote(chord(11))).toBe(47);
    expect(bassNote(chord(1))).toBe(45); // A7 → A
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/harmony/voicing.test.ts`
Expected: FAIL — `Error: Cannot find module './voicing'`

- [ ] **Step 3: Implement voicing.ts**

Create `src/harmony/voicing.ts`:

```ts
import { pc, type Chord } from './theory';

const RANGE_LOW = 48;
const RANGE_HIGH = 79;
const FIRST_LOW = 52; // first-chord root lies in [52, 64)
const MEAN_LOW = 55;
const MEAN_HIGH = 70;

/** Chord tones relative to the root, folded into one octave, sorted; drops the 5th above 4 notes. */
function closeIntervals(chord: Chord): number[] {
  const ivs = chord.intervals.length > 4 ? chord.intervals.filter((i) => i !== 7) : chord.intervals;
  return [...new Set(ivs.map((i) => i % 12))].sort((a, b) => a - b);
}

/** Close-position voicing starting from chord tone `k`, with its lowest note at `low`. */
function stack(rel: number[], k: number, low: number): number[] {
  return rel.map((_, j) => low + pc(rel[(k + j) % rel.length] - rel[k]));
}

function mean(notes: number[]): number {
  return notes.reduce((a, b) => a + b, 0) / notes.length;
}

/** Root position, root in [52, 64). */
function firstPlacement(chord: Chord, rel: number[]): number[] {
  return stack(rel, 0, FIRST_LOW + pc(chord.root - FIRST_LOW));
}

function cost(notes: number[], prev: number[]): number {
  return notes.reduce((sum, n) => sum + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
}

/** Keys voicing with voice leading (spec §3.7). One instance per module; reset() forgets history. */
export class Voicer {
  private prev: number[] | null = null;

  next(chord: Chord): number[] {
    const rel = closeIntervals(chord);
    let notes: number[];
    if (this.prev === null) {
      notes = firstPlacement(chord, rel);
    } else {
      let best: number[] | null = null;
      let bestCost = Infinity;
      for (let k = 0; k < rel.length; k++) {
        const lowPc = pc(chord.root + rel[k]);
        for (let low = RANGE_LOW + pc(lowPc - RANGE_LOW); low <= RANGE_HIGH; low += 12) {
          const cand = stack(rel, k, low);
          if (cand[cand.length - 1] > RANGE_HIGH) continue;
          const c = cost(cand, this.prev);
          if (c < bestCost || (c === bestCost && best !== null && cand[0] < best[0])) {
            best = cand;
            bestCost = c;
          }
        }
      }
      notes = best ?? firstPlacement(chord, rel);
      const m = mean(notes);
      if (m < MEAN_LOW || m > MEAN_HIGH) notes = firstPlacement(chord, rel);
    }
    this.prev = notes;
    return notes;
  }

  reset(): void {
    this.prev = null;
  }
}

/** Pad: the Keys voicing with its 2nd-lowest note raised an octave, then all up an octave. */
export function padVoicing(keys: number[]): number[] {
  const sorted = [...keys].sort((a, b) => a - b);
  if (sorted.length > 1) sorted[1] += 12;
  return sorted.map((n) => n + 12).sort((a, b) => a - b);
}

/** Bass: the chord root in [36, 47]. */
export function bassNote(chord: Chord): number {
  return 36 + chord.root;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/harmony/voicing.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/harmony/voicing.ts src/harmony/voicing.test.ts
git commit -m "Add Keys voice leading, Pad and Bass voicings"
```

---

### Task 6: Event bus and the held-key chord engine (§3.8, §6)

**Files:**
- Create: `src/core/bus.ts`
- Test: `src/core/bus.test.ts`
- Modify: `src/harmony/chordEngine.ts` (add an import; append `ChordEngine`)
- Test: `src/harmony/chordEngineState.test.ts`

**Interfaces:**
- Consumes: `chordForKey` (Task 4); `Chord`, `HarmonySettings`, `pc` (Task 1)
- Produces: `BusEventBody` union: `chordOn {chord, velocity}`, `chordChange {chord, velocity, retrigger}`, `chordOff`, `melodyOn {note, velocity}`, `melodyOff {note}`, `pitchBend {bend: -1..1}`, `mod {value: 0..127}`, `sustain {on}`, `panic`; `BusEvent = BusEventBody & {time}`; `class Bus { emit(body); subscribe(fn): unsubscribe }`. `class ChordEngine(settings: () => HarmonySettings, emit)` with `keyDown(note, velocity)`, `keyUp(note)`, `setSustain(on)`, `settingsChanged()`, `reset()`, `current(): Chord | null`.

- [ ] **Step 1: Write the failing bus test**

Create `src/core/bus.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Bus, type BusEvent } from './bus';

describe('Bus', () => {
  it('timestamps events and delivers them to every subscriber', () => {
    const bus = new Bus(() => 42);
    const a: BusEvent[] = [];
    const b: BusEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.emit({ type: 'melodyOn', note: 60, velocity: 100 });
    expect(a).toEqual([{ type: 'melodyOn', note: 60, velocity: 100, time: 42 }]);
    expect(b).toEqual(a);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new Bus(() => 0);
    const got: BusEvent[] = [];
    const off = bus.subscribe((e) => got.push(e));
    off();
    bus.emit({ type: 'panic' });
    expect(got).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/bus.test.ts`
Expected: FAIL — `Error: Cannot find module './bus'`

- [ ] **Step 3: Implement the bus**

Create `src/core/bus.ts`:

```ts
import type { Chord } from '../harmony/theory';

export type BusEventBody =
  | { type: 'chordOn'; chord: Chord; velocity: number }
  | { type: 'chordChange'; chord: Chord; velocity: number; retrigger: boolean }
  | { type: 'chordOff' }
  | { type: 'melodyOn'; note: number; velocity: number }
  | { type: 'melodyOff'; note: number }
  | { type: 'pitchBend'; bend: number } // -1..1
  | { type: 'mod'; value: number } // CC1, 0..127
  | { type: 'sustain'; on: boolean }
  | { type: 'panic' };

export type BusEvent = BusEventBody & { time: number }; // time: performance.now() ms

export type Listener = (event: BusEvent) => void;

export class Bus {
  private listeners: Listener[] = [];

  constructor(private now: () => number = () => performance.now()) {}

  emit(body: BusEventBody): void {
    const event = { ...body, time: this.now() } as BusEvent;
    for (const l of [...this.listeners]) l(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/bus.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit the bus**

```bash
git add src/core/bus.ts src/core/bus.test.ts
git commit -m "Add typed, timestamped event bus"
```

- [ ] **Step 6: Write the failing engine test**

The last sustain test pins Review Focus #5.

Create `src/harmony/chordEngineState.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { ChordEngine } from './chordEngine';
import type { HarmonySettings } from './theory';

type Ev = { type: string; chord?: { name: string }; velocity?: number; retrigger?: boolean };

let settings: HarmonySettings;
let events: Ev[];
let engine: ChordEngine;
const summary = () =>
  events.map((e) =>
    e.type === 'chordOff' ? 'off' : `${e.type === 'chordOn' ? 'on' : e.retrigger ? 'change!' : 'change'} ${e.chord!.name}`,
  );

beforeEach(() => {
  settings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
  events = [];
  engine = new ChordEngine(() => settings, (e) => events.push(e as Ev));
});

describe('ChordEngine held keys (§3.8)', () => {
  it('starts and ends a chord', () => {
    engine.keyDown(48, 90);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'off']);
    expect(events[0].velocity).toBe(90);
  });

  it('identifies chord keys by pitch class', () => {
    engine.keyDown(50, 90); // D in any octave → Dm
    expect(summary()).toEqual(['on Dm']);
    expect(engine.current()?.name).toBe('Dm');
  });

  it('plays the most recent key and falls back on release (retrigger)', () => {
    engine.keyDown(48, 80); // C
    engine.keyDown(53, 70); // F
    engine.keyUp(53);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'change! F', 'change! C', 'off']);
    expect(events[2].velocity).toBe(80);
  });

  it('ignores the release of a key that is not sounding', () => {
    engine.keyDown(48, 80);
    engine.keyDown(53, 70);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'change! F']);
  });

  it('does not retrigger when the fallback key has the same pitch class', () => {
    engine.keyDown(48, 80);
    engine.keyDown(60, 70);
    engine.keyUp(60);
    expect(summary()).toEqual(['on C', 'change! C']);
  });

  it('recomputes on settings changes without retriggering', () => {
    engine.keyDown(50, 80); // Dm
    settings = { ...settings, extLevel: 2 };
    engine.settingsChanged();
    expect(summary()).toEqual(['on Dm', 'change Dm9']);
  });

  it('emits nothing on a settings change that leaves the chord unchanged, or when silent', () => {
    engine.settingsChanged();
    engine.keyDown(48, 80);
    settings = { ...settings, layout: 'static' }; // C major: static = real
    engine.settingsChanged();
    expect(summary()).toEqual(['on C']);
  });

  it('sets the tonic live: the held key re-resolves', () => {
    engine.keyDown(50, 80); // D in C major → Dm
    settings = { ...settings, tonic: 2 }; // D major → D
    engine.settingsChanged();
    expect(summary()).toEqual(['on Dm', 'change D']);
  });
});

describe('ChordEngine sustain', () => {
  it('holds the chord after release until the pedal lifts', () => {
    engine.setSustain(true);
    engine.keyDown(48, 80);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C']);
    engine.setSustain(false);
    expect(summary()).toEqual(['on C', 'off']);
  });

  it('changes chord on a new press under sustain, and ends it on pedal up', () => {
    engine.setSustain(true);
    engine.keyDown(48, 80);
    engine.keyUp(48);
    engine.keyDown(53, 80);
    engine.keyUp(53);
    engine.setSustain(false);
    expect(summary()).toEqual(['on C', 'change! F', 'off']);
  });

  it('falls back to a still-held key when the pedal lifts', () => {
    engine.keyDown(55, 80); // G held
    engine.setSustain(true);
    engine.keyDown(48, 80); // C
    engine.keyUp(48);
    engine.setSustain(false);
    expect(summary()).toEqual(['on G', 'change! C', 'change! G']);
  });

  it('recomputes a sustained chord on settings changes and still ends it on pedal up', () => {
    engine.setSustain(true);
    engine.keyDown(50, 80); // Dm
    engine.keyUp(50);
    settings = { ...settings, extLevel: 2 };
    engine.settingsChanged();
    engine.setSustain(false);
    expect(summary()).toEqual(['on Dm', 'change Dm9', 'off']);
  });

  it('reset() forgets everything silently', () => {
    engine.keyDown(48, 80);
    engine.reset();
    engine.keyUp(48);
    expect(summary()).toEqual(['on C']);
    expect(engine.current()).toBeNull();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/harmony/chordEngineState.test.ts`
Expected: FAIL — `TypeError: … ChordEngine is not a constructor`.

- [ ] **Step 8: Add the ChordEngine**

In `src/harmony/chordEngine.ts`, add this import as the first line:

```ts
import type { BusEventBody } from '../core/bus';
```

Then append to the end of the file:

```ts
interface HeldKey {
  note: number;
  velocity: number;
  down: boolean; // false = released while sustain was on
}

type ChordEvent = Extract<BusEventBody, { type: 'chordOn' | 'chordChange' | 'chordOff' }>;

/**
 * Held chord keys and live changes (spec §3.8). The most recently pressed key sounds;
 * releasing it falls back to the most recent still-held key.
 */
export class ChordEngine {
  private stack: HeldKey[] = [];
  private sustainOn = false;
  private sounding: { chord: Chord; velocity: number; note: number } | null = null;

  constructor(
    private settings: () => HarmonySettings,
    private emit: (event: ChordEvent) => void,
  ) {}

  current(): Chord | null {
    return this.sounding?.chord ?? null;
  }

  keyDown(note: number, velocity: number): void {
    this.stack = this.stack.filter((h) => h.note !== note);
    this.stack.push({ note, velocity, down: true });
    this.update('press');
  }

  keyUp(note: number): void {
    const held = this.stack.find((h) => h.note === note);
    if (!held) return;
    if (this.sustainOn) held.down = false;
    else this.stack = this.stack.filter((h) => h !== held);
    this.update('release');
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    if (!on) {
      this.stack = this.stack.filter((h) => h.down);
      this.update('release');
    }
  }

  /** Call when tonic, tonality, layout, table or extension level change. */
  settingsChanged(): void {
    this.update('settings');
  }

  /** Forget held keys and the sounding chord without emitting (used by panic). */
  reset(): void {
    this.stack = [];
    this.sustainOn = false;
    this.sounding = null;
  }

  private update(cause: 'press' | 'release' | 'settings'): void {
    const top = this.stack.at(-1);
    const prev = this.sounding;
    if (!top) {
      if (prev) {
        this.sounding = null;
        this.emit({ type: 'chordOff' });
      }
      return;
    }
    const chord = chordForKey(pc(top.note), this.settings());
    this.sounding = { chord, velocity: top.velocity, note: top.note };
    if (!prev) {
      this.emit({ type: 'chordOn', chord, velocity: top.velocity });
    } else if (cause === 'press') {
      this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: true });
    } else if (cause === 'release') {
      if (pc(prev.note) !== pc(top.note)) {
        this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: true });
      }
    } else if (JSON.stringify(prev.chord) !== JSON.stringify(chord)) {
      this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: false });
    }
  }
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/harmony && npm run typecheck`
Expected: PASS (all harmony tests, including 13 in chordEngineState.test.ts); `tsc` prints nothing.

- [ ] **Step 10: Commit the engine**

```bash
git add src/harmony/chordEngine.ts src/harmony/chordEngineState.test.ts
git commit -m "Add held-key chord engine with sustain and live recompute"
```

---

### Task 7: Settings store (§6)

**Files:**
- Create: `src/core/store.ts`
- Test: `src/core/store.test.ts`

**Interfaces:**
- Consumes: `HarmonySettings`, `ExtLevel`, `LayoutMode`, `TableId`, `Tonality` (Task 1)
- Produces: `ModuleId = 'keys'|'pad'|'bass'|'melody'`, `MODULE_IDS`, `PRESET_CHOICES`, `ControlTarget`, `CONTROL_TARGETS`, `EncoderMode`, `Binding {target, channel 1..16, cc, mode}`, `ModuleSettings {enabled, volume, sound, preset, port, channel}`, `MasterSettings {volume, reverb, delay, tone}`, `Settings` (HarmonySettings + `splitPoint`, `keySelectNote`, `bindings`, `modules`, `master`, `input`), `STORAGE_KEY`, `defaultSettings()`, `isValidSettings(v)`, `class Store(storage | null) { get(); update(mutate); subscribe((next, prev) => void): unsubscribe }`.

- [ ] **Step 1: Write the failing test**

Create `src/core/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { defaultSettings, isValidSettings, Store, STORAGE_KEY, type Settings } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('Store', () => {
  it('starts from defaults when nothing is stored', () => {
    expect(new Store(memoryStorage()).get()).toEqual(defaultSettings());
    expect(new Store(null).get()).toEqual(defaultSettings());
  });

  it('defaults to C major, real mode, split 60, key-select 79, CC 14–21 bindings', () => {
    const s = defaultSettings();
    expect([s.tonic, s.tonality, s.layout, s.table, s.extLevel]).toEqual([0, 'major', 'real', 'secdom', 0]);
    expect([s.splitPoint, s.keySelectNote]).toEqual([60, 79]);
    expect(s.bindings.map((b) => `${b.cc}:${b.target}`)).toEqual([
      '14:extensions', '15:vol.keys', '16:vol.pad', '17:vol.bass',
      '18:vol.melody', '19:tone', '20:reverb', '21:master',
    ]);
    expect(Object.values(s.modules).map((m) => m.channel)).toEqual([1, 4, 2, 5]);
    expect(Object.values(s.modules).every((m) => m.port === null)).toBe(true);
  });

  it('persists updates and reloads them', () => {
    const storage = memoryStorage();
    const a = new Store(storage);
    a.update((s) => {
      s.tonic = 7;
      s.modules.keys.port = 'Bome';
    });
    const b = new Store(storage);
    expect(b.get().tonic).toBe(7);
    expect(b.get().modules.keys.port).toBe('Bome');
  });

  it('notifies subscribers with next and prev, without mutating prev', () => {
    const store = new Store(memoryStorage());
    const seen: [Settings, Settings][] = [];
    const off = store.subscribe((n, p) => seen.push([n, p]));
    store.update((s) => (s.extLevel = 2));
    off();
    store.update((s) => (s.extLevel = 3));
    expect(seen).toHaveLength(1);
    expect(seen[0][0].extLevel).toBe(2);
    expect(seen[0][1].extLevel).toBe(0);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const store = new Store(memoryStorage({ [STORAGE_KEY]: '{not json' }));
    expect(store.get()).toEqual(defaultSettings());
  });

  it('falls back to defaults when any field is invalid', () => {
    const bad = { ...defaultSettings(), tonic: 12 };
    expect(new Store(memoryStorage({ [STORAGE_KEY]: JSON.stringify(bad) })).get().tonic).toBe(0);
    const badPreset = defaultSettings();
    badPreset.modules.pad.preset = 'epiano'; // a Keys preset, not a Pad one
    expect(isValidSettings(badPreset)).toBe(false);
  });

  it('ignores settings stored by an older version under another key', () => {
    const store = new Store(memoryStorage({ 'nopia-web.settings.v0': JSON.stringify({ tonic: 5 }) }));
    expect(store.get().tonic).toBe(0);
  });

  it('keeps working when storage throws', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    const store = new Store(throwing);
    store.update((s) => (s.tonic = 3));
    expect(store.get().tonic).toBe(3);
  });

  it('validates the defaults', () => {
    expect(isValidSettings(defaultSettings())).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/store.test.ts`
Expected: FAIL — `Error: Cannot find module './store'`

- [ ] **Step 3: Implement the store**

`update()` clones with `structuredClone`, so subscribers always get an untouched `prev`. Storage errors are swallowed, so private-mode browsers still work for the session.

Create `src/core/store.ts`:

```ts
import type { ExtLevel, HarmonySettings, LayoutMode, TableId, Tonality } from '../harmony/theory';

export type ModuleId = 'keys' | 'pad' | 'bass' | 'melody';
export const MODULE_IDS: ModuleId[] = ['keys', 'pad', 'bass', 'melody'];

/** Presets each module offers; sound/presets.ts implements them. */
export const PRESET_CHOICES: Record<ModuleId, { id: string; label: string }[]> = {
  keys: [
    { id: 'epiano', label: 'E-piano' },
    { id: 'organ', label: 'Organ' },
    { id: 'pluck', label: 'Pluck' },
  ],
  pad: [
    { id: 'warmPad', label: 'Warm saw pad' },
    { id: 'glass', label: 'Glass' },
  ],
  bass: [
    { id: 'sub', label: 'Sub' },
    { id: 'sawBass', label: 'Saw bass' },
  ],
  melody: [
    { id: 'lead', label: 'Lead' },
    { id: 'leadGlide', label: 'Lead (glide)' },
  ],
};

export type ControlTarget =
  | 'extensions'
  | 'layout'
  | 'tonality'
  | 'table'
  | 'vol.keys'
  | 'vol.pad'
  | 'vol.bass'
  | 'vol.melody'
  | 'tone'
  | 'reverb'
  | 'delay'
  | 'master'
  | 'panic';

export const CONTROL_TARGETS: ControlTarget[] = [
  'extensions', 'layout', 'tonality', 'table',
  'vol.keys', 'vol.pad', 'vol.bass', 'vol.melody',
  'tone', 'reverb', 'delay', 'master', 'panic',
];

export type EncoderMode = 'detect' | 'absolute' | 'relative';

export interface Binding {
  target: ControlTarget;
  channel: number; // 1..16
  cc: number; // 0..127
  mode: EncoderMode;
}

export interface ModuleSettings {
  enabled: boolean;
  volume: number; // 0..1
  sound: boolean; // internal sound on/off
  preset: string;
  port: string | null; // MIDI output name, null = no MIDI out
  channel: number; // 1..16
}

export interface MasterSettings {
  volume: number; // all 0..1
  reverb: number;
  delay: number;
  tone: number;
}

export interface Settings extends HarmonySettings {
  splitPoint: number;
  keySelectNote: number;
  bindings: Binding[];
  modules: Record<ModuleId, ModuleSettings>;
  master: MasterSettings;
  input: string | null; // MIDI input name
}

export const STORAGE_KEY = 'nopia-web.settings.v1';

export function defaultSettings(): Settings {
  const mod = (preset: string, channel: number, volume: number): ModuleSettings => ({
    enabled: true, volume, sound: true, preset, port: null, channel,
  });
  const bind = (cc: number, target: ControlTarget): Binding => ({ target, channel: 1, cc, mode: 'detect' });
  return {
    tonic: 0,
    tonality: 'major',
    layout: 'real',
    table: 'secdom',
    extLevel: 0,
    splitPoint: 60,
    keySelectNote: 79,
    bindings: [
      bind(14, 'extensions'), bind(15, 'vol.keys'), bind(16, 'vol.pad'), bind(17, 'vol.bass'),
      bind(18, 'vol.melody'), bind(19, 'tone'), bind(20, 'reverb'), bind(21, 'master'),
    ],
    modules: {
      keys: mod('epiano', 1, 0.8),
      pad: mod('warmPad', 4, 0.5),
      bass: mod('sub', 2, 0.7),
      melody: mod('lead', 5, 0.8),
    },
    master: { volume: 0.8, reverb: 0.25, delay: 0.1, tone: 0.8 },
    input: null,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): boolean =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isUnit = (v: unknown): boolean => typeof v === 'number' && v >= 0 && v <= 1;
const isOneOf = (v: unknown, options: readonly unknown[]): boolean => options.includes(v);
const isNameOrNull = (v: unknown): boolean => v === null || typeof v === 'string';

function isBinding(v: unknown): boolean {
  return isObj(v) && isOneOf(v.target, CONTROL_TARGETS) && isInt(v.channel, 1, 16) &&
    isInt(v.cc, 0, 127) && isOneOf(v.mode, ['detect', 'absolute', 'relative']);
}

function isModule(id: ModuleId, v: unknown): boolean {
  return isObj(v) && typeof v.enabled === 'boolean' && isUnit(v.volume) && typeof v.sound === 'boolean' &&
    isOneOf(v.preset, PRESET_CHOICES[id].map((p) => p.id)) && isNameOrNull(v.port) && isInt(v.channel, 1, 16);
}

export function isValidSettings(v: unknown): v is Settings {
  if (!isObj(v)) return false;
  const { modules, master } = v;
  return isInt(v.tonic, 0, 11) &&
    isOneOf(v.tonality, ['major', 'minor'] satisfies Tonality[]) &&
    isOneOf(v.layout, ['real', 'static'] satisfies LayoutMode[]) &&
    isOneOf(v.table, ['secdom', 'borrowed'] satisfies TableId[]) &&
    isOneOf(v.extLevel, [0, 1, 2, 3] satisfies ExtLevel[]) &&
    isInt(v.splitPoint, 0, 127) &&
    isInt(v.keySelectNote, 0, 127) &&
    Array.isArray(v.bindings) && v.bindings.every(isBinding) &&
    isObj(modules) && MODULE_IDS.every((id) => isModule(id, modules[id])) &&
    isObj(master) && isUnit(master.volume) && isUnit(master.reverb) && isUnit(master.delay) && isUnit(master.tone) &&
    isNameOrNull(v.input);
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;
type StoreListener = (next: Settings, prev: Settings) => void;

export class Store {
  private settings: Settings;
  private listeners: StoreListener[] = [];

  constructor(private storage: KeyValueStorage | null) {
    this.settings = this.load();
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  /** Apply `mutate` to a copy of the settings, persist it and notify subscribers. */
  update(mutate: (draft: Settings) => void): void {
    const prev = this.settings;
    const next = structuredClone(prev);
    mutate(next);
    this.settings = next;
    this.save();
    for (const l of [...this.listeners]) l(next, prev);
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private load(): Settings {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidSettings(parsed)) return parsed;
      }
    } catch {
      // unreadable storage or corrupt JSON: fall through to defaults
    }
    return defaultSettings();
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // storage full or blocked: settings still work for this session
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/core/store.test.ts && npm run typecheck`
Expected: PASS (9 tests); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/store.ts src/core/store.test.ts
git commit -m "Add persisted, validated settings store"
```

---

### Task 8: Control map: MIDI learn and encoder detection (§4.3)

**Files:**
- Create: `src/input/controlMap.ts`
- Test: `src/input/controlMap.test.ts`

**Interfaces:**
- Consumes: `Store`, `Binding`, `ControlTarget`, `EncoderMode`, `ModuleId`, `Settings` (Task 7)
- Produces: `TARGET_INFO: Record<ControlTarget, {label, kind}>`, `DETECT_SAMPLES = 8`, `TICKS_PER_STEP = 8`, `class ControlMap(store, {panic})` with `arm(target | null)`, `armedTarget()`, `onArmedChange(fn)`, `setMode(target, mode)`, `unbind(target)`, `handleCC(channel 1..16, cc, value): boolean` (true = consumed).

- [ ] **Step 1: Write the failing test**

Create `src/input/controlMap.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../core/store';
import { ControlMap, DETECT_SAMPLES, TICKS_PER_STEP } from './controlMap';

let store: Store;
let panics: number;
let map: ControlMap;

beforeEach(() => {
  store = new Store(null);
  panics = 0;
  map = new ControlMap(store, { panic: () => panics++ });
});

const binding = (target: string) => store.get().bindings.find((b) => b.target === target);

describe('MIDI learn', () => {
  it('binds the next CC (and its channel) to the armed target', () => {
    map.arm('reverb');
    expect(map.handleCC(3, 40, 64)).toBe(true);
    expect(binding('reverb')).toEqual({ target: 'reverb', channel: 3, cc: 40, mode: 'detect' });
    expect(map.armedTarget()).toBeNull();
    expect(store.get().master.reverb).toBe(0.25); // the learning message itself is not applied
  });

  it('replaces the target\'s old binding and any other binding on that CC', () => {
    map.arm('tone');
    map.handleCC(1, 14, 0); // CC14 was Extensions
    expect(binding('extensions')).toBeUndefined();
    expect(store.get().bindings.filter((b) => b.target === 'tone')).toHaveLength(1);
  });

  it('notifies when the armed target changes', () => {
    let calls = 0;
    map.onArmedChange(() => calls++);
    map.arm('delay');
    map.handleCC(1, 50, 1);
    expect(calls).toBe(2);
  });

  it('ignores unbound CCs', () => {
    expect(map.handleCC(1, 99, 64)).toBe(false);
  });
});

describe('encoder mode detection', () => {
  it('detects absolute from a value outside 1–10 / 118–127 and applies it', () => {
    map.handleCC(1, 15, 64); // vol.keys, default binding
    expect(binding('vol.keys')?.mode).toBe('absolute');
    expect(store.get().modules.keys.volume).toBeCloseTo(64 / 127);
  });

  it(`detects relative after ${DETECT_SAMPLES} values in the relative ranges`, () => {
    for (let i = 0; i < DETECT_SAMPLES; i++) map.handleCC(1, 15, i % 2 ? 1 : 127);
    expect(binding('vol.keys')?.mode).toBe('relative');
  });

  it('applies possible-relative values as relative while detecting', () => {
    const before = store.get().modules.keys.volume;
    map.handleCC(1, 15, 2); // +2
    expect(store.get().modules.keys.volume).toBeCloseTo(before + 2 / 127);
    expect(binding('vol.keys')?.mode).toBe('detect');
  });

  it('decodes two\'s complement and clamps to 0..1', () => {
    map.setMode('vol.keys', 'relative');
    map.handleCC(1, 15, 118); // −10
    expect(store.get().modules.keys.volume).toBeCloseTo(0.8 - 10 / 127);
    store.update((s) => (s.modules.keys.volume = 0.99));
    map.handleCC(1, 15, 10);
    expect(store.get().modules.keys.volume).toBe(1);
  });

  it('honours a manually set mode', () => {
    map.setMode('master', 'absolute');
    map.handleCC(1, 21, 5);
    expect(store.get().master.volume).toBeCloseTo(5 / 127);
  });
});

describe('targets', () => {
  it('quantizes Extensions to 4 steps in absolute mode', () => {
    map.setMode('extensions', 'absolute');
    const levels = [0, 31, 32, 63, 64, 95, 96, 127].map((v) => {
      map.handleCC(1, 14, v);
      return store.get().extLevel;
    });
    expect(levels).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it(`steps Extensions every ${TICKS_PER_STEP} relative ticks, clamped to 0..3`, () => {
    map.setMode('extensions', 'relative');
    for (let i = 0; i < TICKS_PER_STEP - 1; i++) map.handleCC(1, 14, 1);
    expect(store.get().extLevel).toBe(0);
    map.handleCC(1, 14, 1);
    expect(store.get().extLevel).toBe(1);
    for (let i = 0; i < 10; i++) map.handleCC(1, 14, 10);
    expect(store.get().extLevel).toBe(3);
    map.handleCC(1, 14, 127 - TICKS_PER_STEP + 1); // −TICKS_PER_STEP
    expect(store.get().extLevel).toBe(2);
  });

  it('flips toggles on values > 63 only', () => {
    map.arm('tonality');
    map.handleCC(1, 30, 127);
    map.handleCC(1, 30, 127);
    expect(store.get().tonality).toBe('minor');
    map.handleCC(1, 30, 0);
    expect(store.get().tonality).toBe('minor');
    map.handleCC(1, 30, 127);
    expect(store.get().tonality).toBe('major');
  });

  it('toggles layout and table', () => {
    map.arm('layout');
    map.handleCC(1, 31, 0);
    map.handleCC(1, 31, 127);
    map.arm('table');
    map.handleCC(1, 32, 0);
    map.handleCC(1, 32, 127);
    expect([store.get().layout, store.get().table]).toEqual(['static', 'borrowed']);
  });

  it('fires panic on press', () => {
    map.arm('panic');
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 0);
    expect(panics).toBe(1);
  });

  it('unbinds a target', () => {
    map.unbind('reverb');
    expect(map.handleCC(1, 20, 64)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/input/controlMap.test.ts`
Expected: FAIL — `Error: Cannot find module './controlMap'`

- [ ] **Step 3: Implement the control map**

Toggles and Panic ignore encoder mode: a button's 127 lies in the relative range and would be misdetected. At an end stop, Extensions drops excess relative ticks, so the first turn back steps immediately (the last relative test pins this).

Create `src/input/controlMap.ts`:

```ts
import type { ExtLevel } from '../harmony/theory';
import type { Binding, ControlTarget, EncoderMode, ModuleId, Settings, Store } from '../core/store';

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
  tone: { label: 'Tone', kind: 'continuous' },
  reverb: { label: 'Reverb send', kind: 'continuous' },
  delay: { label: 'Delay send', kind: 'continuous' },
  master: { label: 'Master volume', kind: 'continuous' },
  panic: { label: 'Panic', kind: 'trigger' },
};

/** Values received before a 'detect' binding is declared relative. */
export const DETECT_SAMPLES = 8;
/** Relative-encoder ticks per extension level. */
export const TICKS_PER_STEP = 8;

const inRelativeRange = (v: number) => (v >= 1 && v <= 10) || (v >= 118 && v <= 127);
const relativeDelta = (v: number) => (v < 64 ? v : v - 128);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function getUnit(s: Settings, target: ControlTarget): number {
  if (target.startsWith('vol.')) return s.modules[target.slice(4) as ModuleId].volume;
  if (target === 'master') return s.master.volume;
  return s.master[target as 'tone' | 'reverb' | 'delay'];
}

function setUnit(s: Settings, target: ControlTarget, v: number): void {
  if (target.startsWith('vol.')) s.modules[target.slice(4) as ModuleId].volume = v;
  else if (target === 'master') s.master.volume = v;
  else s.master[target as 'tone' | 'reverb' | 'delay'] = v;
}

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
  private stepTicks = 0;
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
    const { kind } = TARGET_INFO[binding.target];
    if (kind === 'trigger') {
      if (value > 63) this.actions.panic();
      return;
    }
    if (kind === 'toggle') {
      if (value > 63) this.store.update((s) => toggle(s, binding.target));
      return;
    }
    const mode = binding.mode === 'detect' ? this.detect(binding, value) : binding.mode;
    if (kind === 'stepped') {
      this.applyExtensions(mode, value);
      return;
    }
    const v = mode === 'absolute' ? value / 127 : clamp01(getUnit(this.store.get(), binding.target) + relativeDelta(value) / 127);
    this.store.update((s) => setUnit(s, binding.target, v));
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

  private applyExtensions(mode: 'absolute' | 'relative', value: number): void {
    const current = this.store.get().extLevel;
    let level: number = current;
    if (mode === 'absolute') {
      level = Math.min(3, Math.floor((value * 4) / 128));
    } else {
      this.stepTicks += relativeDelta(value);
      while (this.stepTicks >= TICKS_PER_STEP) { level++; this.stepTicks -= TICKS_PER_STEP; }
      while (this.stepTicks <= -TICKS_PER_STEP) { level--; this.stepTicks += TICKS_PER_STEP; }
      level = Math.min(3, Math.max(0, level));
      // at an end stop, ticks pushing further are dropped so the first turn back steps at once
      if ((level === 3 && this.stepTicks > 0) || (level === 0 && this.stepTicks < 0)) this.stepTicks = 0;
    }
    if (level !== current) this.store.update((s) => (s.extLevel = level as ExtLevel));
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/input/controlMap.test.ts && npm run typecheck`
Expected: PASS (15 tests); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/input/controlMap.ts src/input/controlMap.test.ts
git commit -m "Add MIDI learn with relative/absolute encoder detection"
```

---

### Task 9: Input router (§4.2)

**Files:**
- Create: `src/input/inputRouter.ts`
- Test: `src/input/inputRouter.test.ts`

**Interfaces:**
- Consumes: `BusEventBody` (Task 6); `Store` (Task 7); a `ChordEngine`-shaped `{keyDown, keyUp, setSustain}`; a `ControlMap`-shaped `{handleCC}`; `pc` (Task 1)
- Produces: `class InputRouter(deps: RouterDeps)` with `handleMidi(data: ArrayLike<number>)`, `noteOn(note, velocity)`, `noteOff(note)` (also used by the on-screen keyboard), `captureNextNote(cb | null)`, `onNote((note, on) => void)`, `reset()`.

- [ ] **Step 1: Write the failing test**

Two tests pin Review Focus #3 and #4 (repeated note-on; key-select below the split).

Create `src/input/inputRouter.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEventBody } from '../core/bus';
import { Store } from '../core/store';
import { InputRouter } from './inputRouter';

let calls: string[];
let events: BusEventBody[];
let consumeCC: boolean;
let store: Store;
let router: InputRouter;

beforeEach(() => {
  calls = [];
  events = [];
  consumeCC = false;
  store = new Store(null);
  router = new InputRouter({
    engine: {
      keyDown: (n, v) => calls.push(`down ${n} ${v}`),
      keyUp: (n) => calls.push(`up ${n}`),
      setSustain: (on) => calls.push(`sustain ${on}`),
    },
    bus: { emit: (e) => events.push(e) },
    store,
    controls: { handleCC: (ch, cc, v) => (calls.push(`cc ${ch} ${cc} ${v}`), consumeCC) },
  });
});

describe('InputRouter', () => {
  it('sends notes below the split point to the chord engine', () => {
    router.handleMidi([0x90, 48, 100]);
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual(['down 48 100', 'up 48']);
    expect(events).toEqual([]);
  });

  it('passes notes at or above the split point through as melody', () => {
    router.handleMidi([0x90, 60, 90]);
    router.handleMidi([0x90, 60, 0]); // note-on with velocity 0 = note-off
    expect(events).toEqual([
      { type: 'melodyOn', note: 60, velocity: 90 },
      { type: 'melodyOff', note: 60 },
    ]);
    expect(calls).toEqual([]);
  });

  it('accepts notes on any channel', () => {
    router.handleMidi([0x93, 48, 100]);
    expect(calls).toEqual(['down 48 100']);
  });

  it('routes a note-off to the zone its note-on went to, even if the split moved', () => {
    router.handleMidi([0x90, 55, 100]); // chord zone
    store.update((s) => (s.splitPoint = 50));
    router.handleMidi([0x80, 55, 0]);
    expect(calls).toEqual(['down 55 100', 'up 55']);
    expect(events).toEqual([]);
  });

  it('ignores note-offs for notes it never routed', () => {
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual([]);
  });

  it('never sounds the key-select note; while held, a chord key sets the tonic', () => {
    router.handleMidi([0x90, 79, 100]);
    router.handleMidi([0x90, 50, 100]); // D
    router.handleMidi([0x80, 50, 0]);
    router.handleMidi([0x80, 79, 0]);
    expect(store.get().tonic).toBe(2);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('plays chord keys normally once the key-select note is released', () => {
    router.handleMidi([0x90, 79, 100]);
    router.handleMidi([0x80, 79, 0]);
    router.handleMidi([0x90, 50, 100]);
    expect(calls).toEqual(['down 50 100']);
  });

  it('a repeated note-on for a held note releases it first (no stuck chord)', () => {
    router.handleMidi([0x90, 48, 100]);
    router.noteOn(48, 90); // e.g. the on-screen key clicked while the hardware key is held
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual(['down 48 100', 'up 48', 'down 48 90', 'up 48']);
  });

  it('keeps a key-select note below the split reserved', () => {
    store.update((s) => (s.keySelectNote = 59));
    router.handleMidi([0x90, 59, 100]);
    router.handleMidi([0x90, 52, 100]); // E
    expect(calls).toEqual([]);
    expect(store.get().tonic).toBe(4);
  });

  it('passes CCs to the control map first', () => {
    consumeCC = true;
    router.handleMidi([0xb2, 64, 127]);
    expect(calls).toEqual(['cc 3 64 127']);
    expect(events).toEqual([]);
  });

  it('turns unbound CC64 into sustain for chords and melody, on change only', () => {
    router.handleMidi([0xb0, 64, 127]);
    router.handleMidi([0xb0, 64, 100]);
    router.handleMidi([0xb0, 64, 0]);
    expect(calls.filter((c) => c.startsWith('sustain'))).toEqual(['sustain true', 'sustain false']);
    expect(events).toEqual([{ type: 'sustain', on: true }, { type: 'sustain', on: false }]);
  });

  it('turns unbound CC1 into mod events', () => {
    router.handleMidi([0xb0, 1, 77]);
    expect(events).toEqual([{ type: 'mod', value: 77 }]);
  });

  it('decodes pitch bend to −1..1', () => {
    router.handleMidi([0xe0, 0, 64]);
    router.handleMidi([0xe0, 0, 0]);
    router.handleMidi([0xe0, 127, 127]);
    expect(events.map((e) => (e as { bend: number }).bend)).toEqual([0, -1, 8191 / 8192]);
  });

  it('ignores system messages', () => {
    router.handleMidi([0xf8]);
    router.handleMidi([0xfe]);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('captures the next note-on instead of playing it', () => {
    let captured = -1;
    router.captureNextNote((n) => (captured = n));
    router.handleMidi([0x90, 72, 100]);
    router.handleMidi([0x80, 72, 0]);
    router.handleMidi([0x90, 72, 100]);
    expect(captured).toBe(72);
    expect(events).toEqual([{ type: 'melodyOn', note: 72, velocity: 100 }]);
  });

  it('reports key activity to listeners (for the keyboard view)', () => {
    const seen: string[] = [];
    router.onNote((n, on) => seen.push(`${n}${on ? '+' : '-'}`));
    router.noteOn(48, 100); // on-screen keyboard path
    router.noteOff(48);
    expect(seen).toEqual(['48+', '48-']);
    expect(calls).toEqual(['down 48 100', 'up 48']);
  });

  it('reset() forgets held notes so later note-offs do nothing', () => {
    router.handleMidi([0x90, 48, 100]);
    router.handleMidi([0x90, 60, 100]);
    router.reset();
    router.handleMidi([0x80, 48, 0]);
    router.handleMidi([0x80, 60, 0]);
    expect(calls).toEqual(['down 48 100']);
    expect(events).toEqual([{ type: 'melodyOn', note: 60, velocity: 100 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/input/inputRouter.test.ts`
Expected: FAIL — `Error: Cannot find module './inputRouter'`

- [ ] **Step 3: Implement the router**

Each held note remembers the zone it was routed to, so moving the split point while keys are held never strands a note.

Create `src/input/inputRouter.ts`:

```ts
import type { BusEventBody } from '../core/bus';
import type { Store } from '../core/store';
import { pc } from '../harmony/theory';

export interface RouterDeps {
  engine: { keyDown(note: number, velocity: number): void; keyUp(note: number): void; setSustain(on: boolean): void };
  bus: { emit(event: BusEventBody): void };
  store: Store;
  controls: { handleCC(channel: number, cc: number, value: number): boolean };
}

type Zone = 'chord' | 'melody' | 'select' | 'tonic';
type NoteListener = (note: number, on: boolean) => void;

/** Routes raw MIDI and on-screen key presses (spec §4.2). */
export class InputRouter {
  private zones = new Map<number, Zone>(); // held note → the zone it was routed to on note-on
  private capture: ((note: number) => void) | null = null;
  private sustainOn = false;
  private listeners: NoteListener[] = [];

  constructor(private deps: RouterDeps) {}

  handleMidi(data: ArrayLike<number>): void {
    const status = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    if (status === 0x90 && data[2] > 0) this.noteOn(data[1], data[2]);
    else if (status === 0x80 || status === 0x90) this.noteOff(data[1]);
    else if (status === 0xb0) this.controlChange(channel, data[1], data[2]);
    else if (status === 0xe0) {
      const bend = (((data[2] << 7) | data[1]) - 8192) / 8192;
      this.deps.bus.emit({ type: 'pitchBend', bend });
    }
  }

  noteOn(note: number, velocity: number): void {
    if (this.capture) {
      const cb = this.capture;
      this.capture = null;
      cb(note);
      return;
    }
    if (this.zones.has(note)) this.noteOff(note);
    const s = this.deps.store.get();
    let zone: Zone;
    if (note === s.keySelectNote) {
      zone = 'select';
    } else if (note < s.splitPoint) {
      if ([...this.zones.values()].includes('select')) {
        zone = 'tonic';
        this.deps.store.update((d) => (d.tonic = pc(note)));
      } else {
        zone = 'chord';
        this.deps.engine.keyDown(note, velocity);
      }
    } else {
      zone = 'melody';
      this.deps.bus.emit({ type: 'melodyOn', note, velocity });
    }
    this.zones.set(note, zone);
    for (const l of this.listeners) l(note, true);
  }

  noteOff(note: number): void {
    const zone = this.zones.get(note);
    if (zone === undefined) return;
    this.zones.delete(note);
    if (zone === 'chord') this.deps.engine.keyUp(note);
    if (zone === 'melody') this.deps.bus.emit({ type: 'melodyOff', note });
    for (const l of this.listeners) l(note, false);
  }

  /** The next note-on is passed to `cb` instead of being played ("press a key to set"). */
  captureNextNote(cb: ((note: number) => void) | null): void {
    this.capture = cb;
  }

  onNote(listener: NoteListener): void {
    this.listeners.push(listener);
  }

  /** Forget held notes and sustain (used by panic). */
  reset(): void {
    for (const note of [...this.zones.keys()]) {
      this.zones.delete(note);
      for (const l of this.listeners) l(note, false);
    }
    this.sustainOn = false;
    this.capture = null;
  }

  private controlChange(channel: number, cc: number, value: number): void {
    if (this.deps.controls.handleCC(channel, cc, value)) return;
    if (cc === 64) {
      const on = value >= 64;
      if (on === this.sustainOn) return;
      this.sustainOn = on;
      this.deps.engine.setSustain(on);
      this.deps.bus.emit({ type: 'sustain', on });
    } else if (cc === 1) {
      this.deps.bus.emit({ type: 'mod', value });
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/input/inputRouter.test.ts && npm run typecheck`
Expected: PASS (17 tests); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/input/inputRouter.ts src/input/inputRouter.test.ts
git commit -m "Add input router: split, key-select, sustain, bend, CC routing"
```

---

### Task 10: Modules: Keys, Pad, Bass, Melody (§5.1–5.2)

**Files:**
- Create: `src/modules/module.ts`, `src/modules/keys.ts`, `src/modules/pad.ts`, `src/modules/bass.ts`, `src/modules/melody.ts`
- Create: `src/modules/testSink.ts` (test helper)
- Test: `src/modules/modules.test.ts`

**Interfaces:**
- Consumes: `BusEvent` (Task 6); `ModuleId` (Task 7); `Voicer`, `padVoicing`, `bassNote` (Task 5); `chordForKey` (Task 4) in tests
- Produces: `interface NoteSink { noteOn(note, velocity 1..127); noteOff(note); pitchBend(bend -1..1); cc(controller, value); allNotesOff() }`; `interface Module { id; handle(event: BusEvent); allNotesOff() }`; `abstract class ChordModule`; `KeysModule(out)`, `PadModule(out)`, `BassModule(out)`, `MelodyModule(out)`; `FakeSink` (records `on 60 90`, `off 60`, `bend x`, `cc c v`, `allOff`; `take()` returns and clears the log).

- [ ] **Step 1: Write the test helper and the failing test**

Create `src/modules/testSink.ts`:

```ts
import type { NoteSink } from './module';

/** Records sink calls as strings, for module tests. */
export class FakeSink implements NoteSink {
  log: string[] = [];
  noteOn(note: number, velocity: number) { this.log.push(`on ${note} ${velocity}`); }
  noteOff(note: number) { this.log.push(`off ${note}`); }
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

Create `src/modules/modules.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import { chordForKey } from '../harmony/chordEngine';
import type { ExtLevel, HarmonySettings } from '../harmony/theory';
import { BassModule } from './bass';
import { KeysModule } from './keys';
import { MelodyModule } from './melody';
import type { Module } from './module';
import { PadModule } from './pad';
import { FakeSink } from './testSink';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number, extLevel: ExtLevel = 0) => chordForKey(key, { ...base, extLevel });
const send = (m: Module, body: BusEventBody) => m.handle({ ...body, time: 0 } as BusEvent);

let sink: FakeSink;
beforeEach(() => {
  sink = new FakeSink();
});

describe('KeysModule', () => {
  it('plays the Keys voicing at the chord velocity and stops it on chordOff', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(sink.take()).toEqual(['on 60 90', 'on 64 90', 'on 67 90']);
    send(keys, { type: 'chordOff' });
    expect(sink.take()).toEqual(['off 60', 'off 64', 'off 67']);
  });

  it('retriggers every note on a key change', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    sink.take();
    send(keys, { type: 'chordChange', chord: chord(5), velocity: 70, retrigger: true }); // F: 60 65 69
    expect(sink.take()).toEqual(['off 60', 'off 64', 'off 67', 'on 60 70', 'on 65 70', 'on 69 70']);
  });

  it('sustains common notes on a live (non-retrigger) change', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(2), velocity: 90 }); // Dm: 62 65 69
    sink.take();
    send(keys, { type: 'chordChange', chord: chord(2, 1), velocity: 90, retrigger: false }); // Dm7
    const log = sink.take();
    expect(log.filter((l) => l.startsWith('off'))).toEqual([]);
    expect(log).toEqual(['on 60 90']); // adds C below, keeps D F A
  });

  it('panic silences the sink and resets voice leading', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    send(keys, { type: 'chordChange', chord: chord(5), velocity: 90, retrigger: true });
    sink.take();
    send(keys, { type: 'panic' });
    expect(sink.take()).toEqual(['allOff']);
    send(keys, { type: 'chordOn', chord: chord(5), velocity: 90 });
    expect(sink.take()).toEqual(['on 53 90', 'on 57 90', 'on 60 90']); // first-chord placement
  });

  it('ignores melody events', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'melodyOn', note: 72, velocity: 90 });
    send(keys, { type: 'pitchBend', bend: 0.5 });
    expect(sink.take()).toEqual([]);
  });
});

describe('PadModule', () => {
  it('plays the open, raised Pad voicing', () => {
    const pad = new PadModule(sink);
    send(pad, { type: 'chordOn', chord: chord(0), velocity: 64 });
    expect(sink.take()).toEqual(['on 72 64', 'on 79 64', 'on 88 64']);
  });
});

describe('BassModule', () => {
  it('plays only the root, monophonically', () => {
    const bass = new BassModule(sink);
    send(bass, { type: 'chordOn', chord: chord(0), velocity: 100 });
    send(bass, { type: 'chordChange', chord: chord(1), velocity: 100, retrigger: true }); // A7
    expect(sink.take()).toEqual(['on 36 100', 'off 36', 'on 45 100']);
  });

  it('keeps the root sounding through a live extension change', () => {
    const bass = new BassModule(sink);
    send(bass, { type: 'chordOn', chord: chord(0), velocity: 100 });
    sink.take();
    send(bass, { type: 'chordChange', chord: chord(0, 3), velocity: 100, retrigger: false });
    expect(sink.take()).toEqual([]);
  });
});

describe('MelodyModule', () => {
  it('plays melody notes as they come', () => {
    const mel = new MelodyModule(sink);
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    expect(sink.take()).toEqual(['on 72 80', 'off 72']);
  });

  it('forwards pitch bend and CC1', () => {
    const mel = new MelodyModule(sink);
    send(mel, { type: 'pitchBend', bend: -0.5 });
    send(mel, { type: 'mod', value: 99 });
    expect(sink.take()).toEqual(['bend -0.5', 'cc 1 99']);
  });

  it('defers note-offs while sustain is down', () => {
    const mel = new MelodyModule(sink);
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    expect(sink.take()).toEqual(['on 72 80']);
    send(mel, { type: 'sustain', on: false });
    expect(sink.take()).toEqual(['off 72']);
  });

  it('does not release a re-struck note when the pedal lifts while it is held', () => {
    const mel = new MelodyModule(sink);
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    send(mel, { type: 'melodyOn', note: 72, velocity: 90 });
    send(mel, { type: 'sustain', on: false });
    expect(sink.take()).toEqual(['on 72 80', 'on 72 90']);
  });

  it('panic silences everything and forgets sustain', () => {
    const mel = new MelodyModule(sink);
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'panic' });
    send(mel, { type: 'melodyOn', note: 74, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 74 });
    expect(sink.take()).toEqual(['on 72 80', 'allOff', 'on 74 80', 'off 74']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules`
Expected: FAIL — `Error: Cannot find module './bass'`

- [ ] **Step 3: Implement the module base**

Create `src/modules/module.ts`:

```ts
import type { BusEvent } from '../core/bus';
import type { ModuleId } from '../core/store';
import type { Chord } from '../harmony/theory';

/** Where a module's notes go: the internal synth, a MIDI port, or both (spec §5.1). */
export interface NoteSink {
  noteOn(note: number, velocity: number): void; // velocity 1..127
  noteOff(note: number): void;
  pitchBend(bend: number): void; // -1..1
  cc(controller: number, value: number): void;
  allNotesOff(): void;
}

export interface Module {
  readonly id: ModuleId;
  handle(event: BusEvent): void;
  allNotesOff(): void;
}

/** A module that plays one set of notes per chord: Keys, Pad, Bass. */
export abstract class ChordModule implements Module {
  private notes: number[] = [];

  constructor(
    readonly id: ModuleId,
    protected out: NoteSink,
  ) {}

  protected abstract voice(chord: Chord): number[];
  protected abstract resetVoicing(): void;

  handle(e: BusEvent): void {
    if (e.type === 'chordOn') this.play(this.voice(e.chord), e.velocity, true);
    else if (e.type === 'chordChange') this.play(this.voice(e.chord), e.velocity, e.retrigger);
    else if (e.type === 'chordOff') this.play([], 0, true);
    else if (e.type === 'panic') this.allNotesOff();
  }

  allNotesOff(): void {
    this.out.allNotesOff();
    this.notes = [];
    this.resetVoicing();
  }

  /** Retrigger restarts every note; otherwise common notes sustain. */
  private play(next: number[], velocity: number, retrigger: boolean): void {
    const stop = retrigger ? this.notes : this.notes.filter((n) => !next.includes(n));
    const start = retrigger ? next : next.filter((n) => !this.notes.includes(n));
    for (const n of stop) this.out.noteOff(n);
    for (const n of start) this.out.noteOn(n, velocity);
    this.notes = next;
  }
}
```

- [ ] **Step 4: Implement the four modules**

Pad has its own `Voicer`. It sees the same chord sequence as Keys, so it voices identically without sharing state.

Create `src/modules/keys.ts`:

```ts
import type { Chord } from '../harmony/theory';
import { Voicer } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class KeysModule extends ChordModule {
  private voicer = new Voicer();

  constructor(out: NoteSink) {
    super('keys', out);
  }

  protected voice(chord: Chord): number[] {
    return this.voicer.next(chord);
  }

  protected resetVoicing(): void {
    this.voicer.reset();
  }
}
```

Create `src/modules/pad.ts`:

```ts
import type { Chord } from '../harmony/theory';
import { padVoicing, Voicer } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class PadModule extends ChordModule {
  private voicer = new Voicer(); // follows the same chords as Keys, so it voices identically

  constructor(out: NoteSink) {
    super('pad', out);
  }

  protected voice(chord: Chord): number[] {
    return padVoicing(this.voicer.next(chord));
  }

  protected resetVoicing(): void {
    this.voicer.reset();
  }
}
```

Create `src/modules/bass.ts`:

```ts
import type { Chord } from '../harmony/theory';
import { bassNote } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class BassModule extends ChordModule {
  constructor(out: NoteSink) {
    super('bass', out);
  }

  protected voice(chord: Chord): number[] {
    return [bassNote(chord)];
  }

  protected resetVoicing(): void {}
}
```

Create `src/modules/melody.ts`:

```ts
import type { BusEvent } from '../core/bus';
import type { Module, NoteSink } from './module';

/** Right-hand notes, pitch bend and CC1 (vibrato), with sustain-pedal note-off deferral. */
export class MelodyModule implements Module {
  readonly id = 'melody' as const;
  private sustainOn = false;
  private sustained = new Set<number>(); // released while the pedal was down

  constructor(private out: NoteSink) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'melodyOn':
        this.sustained.delete(e.note);
        this.out.noteOn(e.note, e.velocity);
        break;
      case 'melodyOff':
        if (this.sustainOn) this.sustained.add(e.note);
        else this.out.noteOff(e.note);
        break;
      case 'sustain':
        this.sustainOn = e.on;
        if (!e.on) {
          for (const n of this.sustained) this.out.noteOff(n);
          this.sustained.clear();
        }
        break;
      case 'pitchBend':
        this.out.pitchBend(e.bend);
        break;
      case 'mod':
        this.out.cc(1, e.value);
        break;
      case 'panic':
        this.allNotesOff();
        break;
    }
  }

  allNotesOff(): void {
    this.out.allNotesOff();
    this.sustained.clear();
    this.sustainOn = false;
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/modules && npm run typecheck`
Expected: PASS (13 tests); `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/modules
git commit -m "Add Keys, Pad, Bass and Melody modules"
```

---

### Task 11: MIDI out sink and per-module output routing (§5.1, §8)

**Files:**
- Create: `src/sound/midiOutSink.ts`
- Test: `src/sound/midiOutSink.test.ts`
- Create: `src/sound/moduleOutputs.ts`
- Test: `src/sound/moduleOutputs.test.ts`

**Interfaces:**
- Consumes: `NoteSink` (Task 10); `MODULE_IDS`, `ModuleId`, `Settings`, `defaultSettings` (Task 7)
- Produces: `interface MidiOutputLike { send(data: number[]) }`; `class MidiOutSink(port, channel 1..16) implements NoteSink`; `interface InternalSink extends NoteSink { setVolume(v); dispose() }`; `interface SinkFactory { internal(id, preset): InternalSink; midiPort(name): MidiOutputLike | null }`; `class FanoutSink implements NoteSink { setSinks(sinks) }`; `class ModuleOutputs(factory) { sink(id): NoteSink; portMissing(id): boolean; sync(settings) }`.

- [ ] **Step 1: Write the failing MIDI-out test**

Create `src/sound/midiOutSink.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MidiOutSink } from './midiOutSink';

function fakePort() {
  const sent: number[][] = [];
  return { sent, send: (d: number[]) => void sent.push(d) };
}

describe('MidiOutSink', () => {
  it('sends note on/off on its channel', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 4);
    sink.noteOn(60, 100);
    sink.noteOff(60);
    expect(port.sent).toEqual([[0x93, 60, 100], [0x83, 60, 0]]);
  });

  it('only sends note-offs for notes it started', () => {
    const port = fakePort();
    new MidiOutSink(port, 1).noteOff(60);
    expect(port.sent).toEqual([]);
  });

  it('retriggers a note that is already sounding', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 1);
    sink.noteOn(60, 100);
    sink.noteOn(60, 90);
    expect(port.sent).toEqual([[0x90, 60, 100], [0x80, 60, 0], [0x90, 60, 90]]);
  });

  it('allNotesOff sends explicit note-offs then CC123', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 2);
    sink.noteOn(60, 100);
    sink.noteOn(64, 100);
    port.sent.length = 0;
    sink.allNotesOff();
    expect(port.sent).toEqual([[0x81, 60, 0], [0x81, 64, 0], [0xb1, 123, 0]]);
  });

  it('encodes pitch bend as 14 bits', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 5);
    sink.pitchBend(0);
    sink.pitchBend(-1);
    sink.pitchBend(1);
    expect(port.sent).toEqual([[0xe4, 0, 64], [0xe4, 0, 0], [0xe4, 127, 127]]);
  });

  it('sends CCs', () => {
    const port = fakePort();
    new MidiOutSink(port, 5).cc(1, 99);
    expect(port.sent).toEqual([[0xb4, 1, 99]]);
  });

  it('survives a port that throws', () => {
    const sink = new MidiOutSink({ send: () => { throw new Error('disconnected'); } }, 1);
    expect(() => {
      sink.noteOn(60, 100);
      sink.allNotesOff();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/sound/midiOutSink.test.ts`
Expected: FAIL — `Error: Cannot find module './midiOutSink'`

- [ ] **Step 3: Implement MidiOutSink**

Create `src/sound/midiOutSink.ts`:

```ts
import type { NoteSink } from '../modules/module';

export interface MidiOutputLike {
  send(data: number[]): void;
}

/** Sends a module's notes to one MIDI output port and channel, tracking sounding notes. */
export class MidiOutSink implements NoteSink {
  private sounding = new Set<number>();
  private ch: number;

  constructor(
    private port: MidiOutputLike,
    channel: number, // 1..16
  ) {
    this.ch = channel - 1;
  }

  noteOn(note: number, velocity: number): void {
    if (this.sounding.has(note)) this.send([0x80 | this.ch, note, 0]);
    this.send([0x90 | this.ch, note, Math.min(127, Math.max(1, Math.round(velocity)))]);
    this.sounding.add(note);
  }

  noteOff(note: number): void {
    if (!this.sounding.delete(note)) return;
    this.send([0x80 | this.ch, note, 0]);
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

  private send(data: number[]): void {
    try {
      this.port.send(data);
    } catch {
      // port vanished mid-send; the next sync removes this sink
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/sound/midiOutSink.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sound/midiOutSink.ts src/sound/midiOutSink.test.ts
git commit -m "Add MIDI out sink with exact note tracking"
```

- [ ] **Step 6: Write the failing routing test**

Create `src/sound/moduleOutputs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, type ModuleId, type Settings } from '../core/store';
import { ModuleOutputs, type InternalSink, type SinkFactory } from './moduleOutputs';

let log: string[];
let ports: Map<string, { send(d: number[]): void }>;
let factory: SinkFactory;
let settings: Settings;
let outputs: ModuleOutputs;

function internalSink(id: ModuleId, preset: string): InternalSink {
  const tag = `${id}/${preset}`;
  return {
    noteOn: (n, v) => void log.push(`${tag} on ${n} ${v}`),
    noteOff: (n) => void log.push(`${tag} off ${n}`),
    pitchBend: () => {},
    cc: () => {},
    allNotesOff: () => void log.push(`${tag} allOff`),
    setVolume: (v) => void log.push(`${tag} vol ${v}`),
    dispose: () => void log.push(`${tag} dispose`),
  };
}

function addPort(name: string) {
  ports.set(name, { send: (d) => void log.push(`${name} ${d.join(',')}`) });
}

beforeEach(() => {
  log = [];
  ports = new Map();
  factory = { internal: internalSink, midiPort: (name) => ports.get(name) ?? null };
  settings = defaultSettings();
  outputs = new ModuleOutputs(factory);
});

describe('ModuleOutputs', () => {
  it('routes to the internal synth by default, at the module volume', () => {
    outputs.sync(settings);
    log = [];
    outputs.sink('keys').noteOn(60, 100);
    expect(log).toEqual(['keys/epiano on 60 100']);
  });

  it('sends to MIDI too when a port is chosen, with CC7 for the volume', () => {
    addPort('Bome');
    settings.modules.keys.port = 'Bome';
    outputs.sync(settings);
    expect(log).toContain('Bome 176,7,102'); // channel 1, CC7 = 0.8 * 127
    log = [];
    outputs.sink('keys').noteOn(60, 100);
    expect(log).toEqual(['keys/epiano on 60 100', 'Bome 144,60,100']);
  });

  it('sends MIDI only when internal sound is off', () => {
    addPort('Bome');
    settings.modules.bass.port = 'Bome';
    settings.modules.bass.sound = false;
    outputs.sync(settings);
    log = [];
    outputs.sink('bass').noteOn(36, 100);
    expect(log).toEqual(['Bome 145,36,100']); // channel 2
  });

  it('silences everything when a module is disabled', () => {
    outputs.sync(settings);
    outputs.sink('pad').noteOn(72, 100);
    settings.modules.pad.enabled = false;
    log = [];
    outputs.sync(settings);
    expect(log).toContain('pad/warmPad allOff');
    log = [];
    outputs.sink('pad').noteOn(72, 100);
    expect(log).toEqual([]);
  });

  it('stops and disposes the old synth when the preset changes', () => {
    outputs.sync(settings);
    settings.modules.keys.preset = 'organ';
    log = [];
    outputs.sync(settings);
    expect(log.filter((l) => l.startsWith('keys/'))).toEqual([
      'keys/organ vol 0.8', 'keys/epiano allOff', 'keys/epiano dispose',
    ]);
  });

  it('falls back to internal sound and flags the module when its port disappears', () => {
    addPort('Bome');
    settings.modules.melody.port = 'Bome';
    settings.modules.melody.sound = false;
    outputs.sync(settings);
    outputs.sink('melody').noteOn(72, 100);
    ports.delete('Bome');
    log = [];
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(true);
    expect(log).toContain('Bome 132,72,0'); // the old MIDI sink was told to stop (send may fail)
    log = [];
    outputs.sink('melody').noteOn(74, 100);
    expect(log).toEqual(['melody/lead on 74 100']);
  });

  it('reattaches when the port comes back', () => {
    settings.modules.melody.port = 'Bome';
    settings.modules.melody.sound = false;
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(true);
    addPort('Bome');
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(false);
    log = [];
    outputs.sink('melody').noteOn(74, 100);
    expect(log).toEqual(['Bome 148,74,100']);
  });

  it('changes MIDI channel by replacing the sink (old notes stopped)', () => {
    addPort('Bome');
    settings.modules.keys.port = 'Bome';
    outputs.sync(settings);
    outputs.sink('keys').noteOn(60, 100);
    settings.modules.keys.channel = 3;
    log = [];
    outputs.sync(settings);
    expect(log).toEqual(expect.arrayContaining(['Bome 128,60,0', 'Bome 176,123,0', 'Bome 178,7,102']));
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/sound/moduleOutputs.test.ts`
Expected: FAIL — `Error: Cannot find module './moduleOutputs'`

- [ ] **Step 8: Implement ModuleOutputs**

A missing port forces internal sound on without changing the stored settings, so the module reattaches when the port returns (spec §8).

Create `src/sound/moduleOutputs.ts`:

```ts
import { MODULE_IDS, type ModuleId, type Settings } from '../core/store';
import type { NoteSink } from '../modules/module';
import { MidiOutSink, type MidiOutputLike } from './midiOutSink';

export interface InternalSink extends NoteSink {
  setVolume(volume: number): void; // 0..1
  dispose(): void;
}

export interface SinkFactory {
  internal(id: ModuleId, preset: string): InternalSink;
  /** The connected output with this name, or null when it is not present. */
  midiPort(name: string): MidiOutputLike | null;
}

/** Fans a module's notes out to its current sinks; sinks that are removed get allNotesOff(). */
export class FanoutSink implements NoteSink {
  private sinks: NoteSink[] = [];

  setSinks(next: NoteSink[]): void {
    for (const s of this.sinks) if (!next.includes(s)) s.allNotesOff();
    this.sinks = next;
  }

  noteOn(note: number, velocity: number): void {
    for (const s of this.sinks) s.noteOn(note, velocity);
  }
  noteOff(note: number): void {
    for (const s of this.sinks) s.noteOff(note);
  }
  pitchBend(bend: number): void {
    for (const s of this.sinks) s.pitchBend(bend);
  }
  cc(controller: number, value: number): void {
    for (const s of this.sinks) s.cc(controller, value);
  }
  allNotesOff(): void {
    for (const s of this.sinks) s.allNotesOff();
  }
}

interface Route {
  fanout: FanoutSink;
  internal: { preset: string; sink: InternalSink } | null;
  midi: { key: string; sink: MidiOutSink; volume: number } | null;
  portMissing: boolean;
}

/** Applies module settings (enabled, sound, preset, port, channel, volume) to each module's sinks. */
export class ModuleOutputs {
  private routes = {} as Record<ModuleId, Route>;

  constructor(private factory: SinkFactory) {
    for (const id of MODULE_IDS) {
      this.routes[id] = { fanout: new FanoutSink(), internal: null, midi: null, portMissing: false };
    }
  }

  sink(id: ModuleId): NoteSink {
    return this.routes[id].fanout;
  }

  /** True when the module's chosen MIDI port is not connected (it falls back to internal sound). */
  portMissing(id: ModuleId): boolean {
    return this.routes[id].portMissing;
  }

  sync(settings: Settings): void {
    for (const id of MODULE_IDS) this.syncModule(id, settings);
  }

  private syncModule(id: ModuleId, settings: Settings): void {
    const m = settings.modules[id];
    const route = this.routes[id];
    const port = m.port === null ? null : this.factory.midiPort(m.port);
    route.portMissing = m.port !== null && port === null;

    const oldInternal = route.internal;
    if (m.sound || route.portMissing) {
      if (!route.internal || route.internal.preset !== m.preset) {
        route.internal = { preset: m.preset, sink: this.factory.internal(id, m.preset) };
      }
      route.internal.sink.setVolume(m.volume);
    } else {
      route.internal = null;
    }

    const midiKey = port ? `${m.port}#${m.channel}` : null;
    if (route.midi?.key !== midiKey) {
      route.midi = port && midiKey ? { key: midiKey, sink: new MidiOutSink(port, m.channel), volume: -1 } : null;
    }
    if (route.midi && route.midi.volume !== m.volume) {
      route.midi.volume = m.volume;
      route.midi.sink.cc(7, Math.round(m.volume * 127));
    }

    const sinks: NoteSink[] = [];
    if (m.enabled && route.internal) sinks.push(route.internal.sink);
    if (m.enabled && route.midi) sinks.push(route.midi.sink);
    route.fanout.setSinks(sinks);
    if (oldInternal && oldInternal !== route.internal) oldInternal.sink.dispose();
  }
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run src/sound && npm run typecheck`
Expected: PASS (15 tests); `tsc` prints nothing.

- [ ] **Step 10: Commit**

```bash
git add src/sound/moduleOutputs.ts src/sound/moduleOutputs.test.ts
git commit -m "Route module notes to internal and MIDI sinks with port fallback"
```

---

### Task 12: Web MIDI access (§4.1)

**Files:**
- Create: `src/input/midiAccess.ts`
- Test: `src/input/midiAccess.test.ts`

**Interfaces:**
- Consumes: browser `MIDIAccess`/`MIDIInput`/`MIDIOutput` types (lib.dom)
- Produces: `pickInput(names, stored): string | null`; `class MidiPorts(access)` with `inputNames()`, `outputNames()`, `output(name): MIDIOutput | null`, `useInput(name | null): boolean`, `currentInput()`, `onMessage((data: Uint8Array) => void)`, `onChange(fn)`; `requestMidi(nav): Promise<{ports} | {error: 'unsupported' | 'denied'}>`.

- [ ] **Step 1: Write the failing test**

Create `src/input/midiAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MidiPorts, pickInput, requestMidi } from './midiAccess';

interface FakePort {
  id: string;
  name: string;
  state: 'connected' | 'disconnected';
  onmidimessage?: ((e: { data: Uint8Array }) => void) | null;
  send?: (d: number[]) => void;
}

function fakeAccess(inputs: string[], outputs: string[]) {
  const port = (name: string): FakePort => ({ id: name, name, state: 'connected', onmidimessage: null });
  const access = {
    inputs: new Map(inputs.map((n) => [n, port(n)])),
    outputs: new Map(outputs.map((n) => [n, port(n)])),
    onstatechange: null as null | (() => void),
  };
  return { access, ports: new MidiPorts(access as unknown as MIDIAccess) };
}

describe('pickInput', () => {
  it('prefers the stored name when connected', () => {
    expect(pickInput(['A', 'M32'], 'M32')).toBe('M32');
  });

  it('picks nothing when the stored device is missing', () => {
    expect(pickInput(['A'], 'M32')).toBeNull();
  });

  it('otherwise picks the first input that is not a DAW port', () => {
    expect(pickInput(['KOMPLETE KONTROL M32 DAW', 'Komplete Kontrol M32'], null)).toBe('Komplete Kontrol M32');
    expect(pickInput(['X DAW'], null)).toBe('X DAW');
    expect(pickInput([], null)).toBeNull();
  });
});

describe('MidiPorts', () => {
  it('lists connected ports by name', () => {
    const { access, ports } = fakeAccess(['M32', 'Bome'], ['Bome', 'Synth']);
    access.outputs.get('Synth')!.state = 'disconnected';
    expect(ports.inputNames()).toEqual(['M32', 'Bome']);
    expect(ports.outputNames()).toEqual(['Bome']);
    expect(ports.output('Synth')).toBeNull();
    expect(ports.output('Bome')).not.toBeNull();
  });

  it('delivers messages from the selected input only', () => {
    const { access, ports } = fakeAccess(['M32', 'Other'], []);
    const got: number[][] = [];
    ports.onMessage((d) => got.push([...d]));
    expect(ports.useInput('M32')).toBe(true);
    access.inputs.get('M32')!.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
    expect(access.inputs.get('Other')!.onmidimessage).toBeNull();
    ports.useInput('Other');
    expect(access.inputs.get('M32')!.onmidimessage).toBeNull();
    expect(got).toEqual([[0x90, 60, 100]]);
    expect(ports.currentInput()).toBe('Other');
  });

  it('reports a disconnected input as not usable', () => {
    const { access, ports } = fakeAccess(['M32'], []);
    access.inputs.get('M32')!.state = 'disconnected';
    expect(ports.useInput('M32')).toBe(false);
    expect(ports.currentInput()).toBeNull();
  });

  it('notifies on hot-plug', () => {
    const { access, ports } = fakeAccess([], []);
    let changes = 0;
    ports.onChange(() => changes++);
    access.onstatechange!();
    expect(changes).toBe(1);
  });
});

describe('requestMidi', () => {
  it('reports a missing Web MIDI API', async () => {
    expect(await requestMidi({})).toEqual({ error: 'unsupported' });
  });

  it('reports a denied permission', async () => {
    const nav = { requestMIDIAccess: () => Promise.reject(new DOMException('no', 'SecurityError')) };
    expect(await requestMidi(nav)).toEqual({ error: 'denied' });
  });

  it('wraps the granted access', async () => {
    const { access } = fakeAccess(['M32'], []);
    const nav = { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) };
    const result = await requestMidi(nav);
    expect('ports' in result && result.ports.inputNames()).toEqual(['M32']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/input/midiAccess.test.ts`
Expected: FAIL — `Error: Cannot find module './midiAccess'`

- [ ] **Step 3: Implement the wrapper**

It uses `input.onmidimessage = …` rather than `addEventListener`, because Chrome only opens a port implicitly when the property is set.

Create `src/input/midiAccess.ts`:

```ts
type MessageListener = (data: Uint8Array) => void;

const connected = (p: MIDIPort) => p.state === 'connected';
const portName = (p: MIDIPort) => p.name ?? p.id;

/**
 * Which input to listen to: the stored name when it is connected; nothing when a stored
 * device is missing; otherwise the first input whose name does not mention "DAW".
 */
export function pickInput(names: string[], stored: string | null): string | null {
  if (stored !== null) return names.includes(stored) ? stored : null;
  return names.find((n) => !/daw/i.test(n)) ?? names[0] ?? null;
}

/** Wraps MIDIAccess: port lists, the selected input's messages, hot-plug notifications. */
export class MidiPorts {
  private input: MIDIInput | null = null;
  private messageListeners: MessageListener[] = [];
  private changeListeners: (() => void)[] = [];

  constructor(private access: MIDIAccess) {
    access.onstatechange = () => {
      for (const l of this.changeListeners) l();
    };
  }

  inputNames(): string[] {
    return [...this.access.inputs.values()].filter(connected).map(portName);
  }

  outputNames(): string[] {
    return [...this.access.outputs.values()].filter(connected).map(portName);
  }

  output(name: string): MIDIOutput | null {
    return [...this.access.outputs.values()].find((p) => connected(p) && portName(p) === name) ?? null;
  }

  /** Listen to the named input (null = none). Returns false if it is not connected. */
  useInput(name: string | null): boolean {
    const next =
      name === null ? null : ([...this.access.inputs.values()].find((p) => connected(p) && portName(p) === name) ?? null);
    if (next !== this.input) {
      if (this.input) this.input.onmidimessage = null;
      this.input = next;
      if (next) {
        next.onmidimessage = (e) => {
          if (e.data) for (const l of this.messageListeners) l(e.data);
        };
      }
    }
    return next !== null;
  }

  currentInput(): string | null {
    return this.input ? portName(this.input) : null;
  }

  onMessage(listener: MessageListener): void {
    this.messageListeners.push(listener);
  }

  /** Called when any port is connected or disconnected. */
  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }
}

export type MidiResult = { ports: MidiPorts } | { error: 'unsupported' | 'denied' };

export async function requestMidi(nav: { requestMIDIAccess?: Navigator['requestMIDIAccess'] }): Promise<MidiResult> {
  if (typeof nav.requestMIDIAccess !== 'function') return { error: 'unsupported' };
  try {
    return { ports: new MidiPorts(await nav.requestMIDIAccess({ sysex: false })) };
  } catch {
    return { error: 'denied' };
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/input/midiAccess.test.ts && npm run typecheck`
Expected: PASS (10 tests); `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/input/midiAccess.ts src/input/midiAccess.test.ts
git commit -m "Add Web MIDI wrapper with input selection and hot-plug"
```

---

### Task 13: Sound engine with Tone.js (§5.2–5.3)

**Files:**
- Modify: `package.json` (add `tone`)
- Create: `src/sound/monoNotes.ts`
- Test: `src/sound/monoNotes.test.ts`
- Create: `src/sound/presets.ts`, `src/sound/toneSink.ts`, `src/sound/master.ts`

**Interfaces:**
- Consumes: `InternalSink` (Task 11); `MasterSettings` (Task 7); preset ids from `PRESET_CHOICES` (Task 7)
- Produces: `midiToFreq(note)`, `MonoNotes`; `interface Voice`, `createVoice(presetId): Voice`; `class ToneSink(voice, destination, withVibrato) implements InternalSink` (CC1 → vibrato depth, bend ±2 semitones); `class Master { input; toneInput; apply(master) }`.

- [ ] **Step 1: Install Tone.js**

```bash
npm install tone@^15.1.22
```

- [ ] **Step 2: Write the failing mono-note test**

Create `src/sound/monoNotes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { midiToFreq, MonoNotes } from './monoNotes';

let log: string[];
let mono: MonoNotes;
const f = (n: number) => midiToFreq(n).toFixed(1);

beforeEach(() => {
  log = [];
  mono = new MonoNotes({
    triggerAttack: (freq, _t, v) => log.push(`attack ${freq.toFixed(1)} ${v}`),
    triggerRelease: () => log.push('release'),
    setNote: (freq) => log.push(`set ${freq.toFixed(1)}`),
  });
});

describe('midiToFreq', () => {
  it('maps A4 to 440 Hz and an octave to a doubling', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
  });
});

describe('MonoNotes', () => {
  it('attacks and releases a single note', () => {
    mono.attack(72, 0.8, 0);
    mono.release(72, 0);
    expect(log).toEqual([`attack ${f(72)} 0.8`, 'release']);
  });

  it('falls back to the previous held note when the sounding one is released', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.release(76, 0);
    mono.release(72, 0);
    expect(log).toEqual([`attack ${f(72)} 0.8`, `attack ${f(76)} 0.8`, `set ${f(72)}`, 'release']);
  });

  it('ignores the release of a note that is not sounding', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.release(72, 0);
    expect(log).toHaveLength(2);
  });

  it('releaseAll silences and forgets held notes', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.releaseAll(0);
    mono.release(76, 0);
    expect(log.at(-1)).toBe('release');
    expect(log).toHaveLength(3);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/sound/monoNotes.test.ts`
Expected: FAIL — `Error: Cannot find module './monoNotes'`

- [ ] **Step 4: Implement MonoNotes**

This is the Tone-free part of the mono voices (Bass, Melody), so it can be unit-tested.

Create `src/sound/monoNotes.ts`:

```ts
export function midiToFreq(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** The parts of Tone.MonoSynth that MonoNotes drives. */
export interface MonoSynthLike {
  triggerAttack(freq: number, time: number, velocity: number): unknown;
  triggerRelease(time: number): unknown;
  setNote(freq: number, time: number): unknown;
}

/** Last-note priority for a monophonic synth: releasing the sounding note falls back to a held one. */
export class MonoNotes {
  private stack: number[] = [];

  constructor(private synth: MonoSynthLike) {}

  attack(note: number, velocity: number, time: number): void {
    this.stack = this.stack.filter((n) => n !== note);
    this.stack.push(note);
    this.synth.triggerAttack(midiToFreq(note), time, velocity);
  }

  release(note: number, time: number): void {
    const wasSounding = this.stack.at(-1) === note;
    this.stack = this.stack.filter((n) => n !== note);
    if (!wasSounding) return;
    const top = this.stack.at(-1);
    if (top === undefined) this.synth.triggerRelease(time);
    else this.synth.setNote(midiToFreq(top), time);
  }

  releaseAll(time: number): void {
    this.stack = [];
    this.synth.triggerRelease(time);
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/sound/monoNotes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/sound/monoNotes.ts src/sound/monoNotes.test.ts
git commit -m "Add last-note priority for monophonic voices"
```

- [ ] **Step 7: Write the presets**

Notes are passed to Tone as Hz: a bare number is read as a frequency, so `60` would mean 60 Hz. The settings for each preset are starting points, to be tuned by ear at the hardware check.

Create `src/sound/presets.ts`:

```ts
import * as Tone from 'tone';
import { midiToFreq, MonoNotes } from './monoNotes';

/** A playable instrument behind a ToneSink. Velocity is 0..1, times are AudioContext seconds. */
export interface Voice {
  readonly output: Tone.ToneAudioNode;
  attack(note: number, velocity: number, time: number): void;
  release(note: number, time: number): void;
  releaseAll(time: number): void;
  bend(semitones: number): void;
  dispose(): void;
}

class PolyVoice implements Voice {
  constructor(private synth: Tone.PolySynth) {
    synth.maxPolyphony = 64; // Pad's 2.5 s release overlaps many chords: 24 voices drop notes at 4 chords/s
  }
  get output() {
    return this.synth;
  }
  attack(note: number, velocity: number, time: number) {
    this.synth.triggerAttack(midiToFreq(note), time, velocity);
  }
  release(note: number, time: number) {
    this.synth.triggerRelease(midiToFreq(note), time);
  }
  releaseAll(time: number) {
    this.synth.releaseAll(time);
  }
  bend(semitones: number) {
    this.synth.set({ detune: semitones * 100 });
  }
  dispose() {
    this.synth.dispose();
  }
}

class MonoVoice implements Voice {
  private notes: MonoNotes;
  constructor(private synth: Tone.MonoSynth) {
    this.notes = new MonoNotes(synth);
  }
  get output() {
    return this.synth;
  }
  attack(note: number, velocity: number, time: number) {
    this.notes.attack(note, velocity, time);
  }
  release(note: number, time: number) {
    this.notes.release(note, time);
  }
  releaseAll(time: number) {
    this.notes.releaseAll(time);
  }
  bend(semitones: number) {
    this.synth.detune.value = semitones * 100;
  }
  dispose() {
    this.synth.dispose();
  }
}

const PRESETS: Record<string, () => Voice> = {
  epiano: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 10,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.002, decay: 2, sustain: 0.15, release: 1.2 },
        modulation: { type: 'sine' },
        modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0, release: 0.5 },
        volume: -10,
      }),
    ),
  organ: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'custom', partials: [1, 0.7, 0.3, 0.4, 0, 0.2, 0, 0.15] },
        envelope: { attack: 0.005, decay: 0, sustain: 1, release: 0.06 },
        volume: -14,
      }),
    ),
  pluck: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.002, decay: 0.4, sustain: 0, release: 0.3 },
        volume: -8,
      }),
    ),
  warmPad: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsawtooth', count: 3, spread: 24 },
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 2.5 },
        volume: -20,
      }),
    ),
  glass: () =>
    new PolyVoice(
      new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.5,
        modulationIndex: 3,
        envelope: { attack: 0.6, decay: 1, sustain: 0.6, release: 3 },
        modulationEnvelope: { attack: 0.8, decay: 1, sustain: 0.4, release: 3 },
        volume: -16,
      }),
    ),
  sub: () =>
    new MonoVoice(
      new Tone.MonoSynth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.005, decay: 0.2, sustain: 0.9, release: 0.3 },
        filterEnvelope: { attack: 0.005, decay: 0.1, sustain: 1, release: 0.3, baseFrequency: 400, octaves: 0 },
        volume: -6,
      }),
    ),
  sawBass: () =>
    new MonoVoice(
      new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { type: 'lowpass', Q: 2 },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2 },
        filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2, baseFrequency: 120, octaves: 3 },
        volume: -10,
      }),
    ),
  lead: () => new MonoVoice(lead(0)),
  leadGlide: () => new MonoVoice(lead(0.06)),
};

function lead(portamento: number): Tone.MonoSynth {
  return new Tone.MonoSynth({
    portamento,
    oscillator: { type: 'square' },
    filter: { type: 'lowpass', Q: 1 },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 },
    filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3, baseFrequency: 600, octaves: 3 },
    volume: -14,
  });
}

export function createVoice(preset: string): Voice {
  const make = PRESETS[preset];
  if (!make) throw new Error(`unknown preset ${preset}`);
  return make();
}
```

- [ ] **Step 8: Write the Tone sink**

`Tone.immediate()` rather than `Tone.now()`: see Decision 2. Re-striking a sounding note releases it first, because a PolySynth would otherwise keep both voices and strand one.

Create `src/sound/toneSink.ts`:

```ts
import * as Tone from 'tone';
import type { InternalSink } from './moduleOutputs';
import type { Voice } from './presets';

const DISPOSE_AFTER_MS = 4000; // let release tails finish before disposing

/** A module's internal sound: Voice → (vibrato) → volume → destination. */
export class ToneSink implements InternalSink {
  private gain = new Tone.Gain(0);
  private vibrato: Tone.Vibrato | null = null;
  private sounding = new Set<number>();

  constructor(
    private voice: Voice,
    destination: Tone.InputNode,
    withVibrato: boolean,
  ) {
    this.gain.connect(destination);
    if (withVibrato) {
      this.vibrato = new Tone.Vibrato(5.5, 0);
      voice.output.chain(this.vibrato, this.gain);
    } else {
      voice.output.connect(this.gain);
    }
  }

  noteOn(note: number, velocity: number): void {
    const now = Tone.immediate();
    if (this.sounding.has(note)) this.voice.release(note, now);
    this.voice.attack(note, velocity / 127, now);
    this.sounding.add(note);
  }

  noteOff(note: number): void {
    if (!this.sounding.delete(note)) return;
    this.voice.release(note, Tone.immediate());
  }

  pitchBend(bend: number): void {
    this.voice.bend(bend * 2); // ±2 semitones
  }

  cc(controller: number, value: number): void {
    if (controller === 1 && this.vibrato) this.vibrato.depth.rampTo((value / 127) * 0.5, 0.05);
  }

  allNotesOff(): void {
    this.voice.releaseAll(Tone.immediate());
    this.sounding.clear();
  }

  setVolume(volume: number): void {
    this.gain.gain.rampTo(volume * volume, 0.05);
  }

  dispose(): void {
    this.allNotesOff();
    setTimeout(() => {
      this.voice.dispose();
      this.vibrato?.dispose();
      this.gain.dispose();
    }, DISPOSE_AFTER_MS);
  }
}
```

- [ ] **Step 9: Write the master section**

Create `src/sound/master.ts`:

```ts
import * as Tone from 'tone';
import type { MasterSettings } from '../core/store';

/** Master section: Tone low-pass (Keys/Pad), reverb and delay sends, limiter, master volume. */
export class Master {
  /** For modules that bypass the Tone filter (Bass, Melody). */
  readonly input = new Tone.Gain(1);
  /** For Keys and Pad: through the Tone low-pass first. */
  readonly toneInput = new Tone.Filter(8000, 'lowpass');
  private reverbSend = new Tone.Gain(0);
  private delaySend = new Tone.Gain(0);
  private out = new Tone.Gain(0);

  constructor() {
    const limiter = new Tone.Limiter(-1);
    limiter.chain(this.out, Tone.getDestination());
    this.toneInput.connect(this.input);
    this.input.connect(limiter);
    const reverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.02, wet: 1 }).connect(limiter);
    const delay = new Tone.FeedbackDelay({ delayTime: 0.375, feedback: 0.35, wet: 1 }).connect(limiter);
    this.input.connect(this.reverbSend);
    this.reverbSend.connect(reverb);
    this.input.connect(this.delaySend);
    this.delaySend.connect(delay);
  }

  apply(m: MasterSettings): void {
    this.out.gain.rampTo(m.volume * m.volume, 0.05);
    this.reverbSend.gain.rampTo(m.reverb, 0.05);
    this.delaySend.gain.rampTo(m.delay, 0.05);
    this.toneInput.frequency.rampTo(200 * 90 ** m.tone, 0.05); // 200 Hz .. 18 kHz
  }
}
```

- [ ] **Step 10: Typecheck and run all unit tests**

Run: `npm run typecheck && npm test`
Expected: `tsc` prints nothing; every test file passes. The Tone code is first exercised in a real browser by the Task 14 and 15 Playwright tests.

- [ ] **Step 11: Commit**

```bash
git add src/sound/presets.ts src/sound/toneSink.ts src/sound/master.ts
git commit -m "Add Tone.js presets, internal sound sink and master section"
```

---

### Task 14: App shell: panel, OLED, keyboard view, wiring, browser tests (§7, §8)

**Files:**
- Modify: `package.json` (add `@playwright/test`, `e2e` script)
- Create: `playwright.config.ts`, `e2e/fakeMidi.ts`, `e2e/play.spec.ts`
- Create: `index.html`, `src/main.ts`
- Create: `src/ui/dom.ts`, `src/ui/knob.ts`, `src/ui/oled.ts`, `src/ui/tonalSelector.ts`, `src/ui/keyboardView.ts`, `src/ui/panel.ts`, `src/ui/style.css`

**Interfaces:**
- Consumes: everything from Tasks 1–13
- Produces: `mountPanel(root, deps: PanelDeps)` returning `{ setBanner(kind, text | null), setAudioRunning(running), refreshPorts() }` (Task 16 adds `logMidi`); `createSelect(attrs, onChange) → {el, setOptions(options, selected)}`; `createKnob({label, value, onInput, learn?, large?}) → {el, value(), set(v)}`; `[data-learn="<ControlTarget>"]` marks learnable controls (used by Task 16); test ids `oled-chord`, `oled-roman`, `oled-fn`, `oled-status`, `key-<note>`, `tonic-<pc>`, `layout`, `tonality`, `table`, `input-select`, `panic`, `start-overlay`, `banner-<kind>`. E2E helpers: `withFakeMidi(page, inputs?, outputs?)`, `withoutWebMidi(page)`, `sendMidi(page, bytes, input?)`, `midiSent(page)`, `setConnected(page, name, connected)`, `collectErrors(page)`, `start(page)`, constants `M32`, `SYNTH`.

- [ ] **Step 1: Install Playwright and its browser**

```bash
npm install -D @playwright/test@^1.63.0
npx playwright install chromium
npm pkg set scripts.e2e="playwright test"
```
If Chromium fails to launch for lack of system libraries, run `sudo npx playwright install-deps chromium` once.

- [ ] **Step 2: Write the Playwright config, the fake Web MIDI and the page shell**

The fake replaces `navigator.requestMIDIAccess` before the app loads, records everything sent to outputs in `window.__midi.sent`, and can unplug or replug any port. `index.html` must exist before the first run: Playwright's web-server readiness check rejects Vite's 404 for a missing page.

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

Create `e2e/fakeMidi.ts`:

```ts
import type { Page } from '@playwright/test';

export const M32 = 'Komplete Kontrol M32';
export const SYNTH = 'Fake Synth';

/**
 * Runs in the browser before the app: replaces navigator.requestMIDIAccess with a fake that
 * has the given ports, and exposes window.__midi to send input and read what was output.
 */
function installFakeMidi(opts: { inputs: string[]; outputs: string[] }) {
  type Port = {
    id: string; name: string; type: string; state: string; connection: string;
    onmidimessage: null | ((e: { data: Uint8Array }) => void);
    send(data: number[]): void;
  };
  const sent: { port: string; data: number[] }[] = [];
  const port = (name: string, type: string): Port => ({
    id: `${type}:${name}`, name, type, state: 'connected', connection: 'open', onmidimessage: null,
    send(data) { sent.push({ port: name, data: Array.from(data) }); },
  });
  const inputs = new Map(opts.inputs.map((n) => [`input:${n}`, port(n, 'input')]));
  const outputs = new Map(opts.outputs.map((n) => [`output:${n}`, port(n, 'output')]));
  const access = { inputs, outputs, sysexEnabled: false, onstatechange: null as null | ((e: unknown) => void) };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', {
    configurable: true,
    value: async () => access,
  });
  (window as unknown as { __midi: unknown }).__midi = {
    sent,
    send(name: string, data: number[]) {
      inputs.get(`input:${name}`)?.onmidimessage?.({ data: new Uint8Array(data) });
    },
    setConnected(name: string, connected: boolean) {
      const p = inputs.get(`input:${name}`) ?? outputs.get(`output:${name}`)!;
      p.state = connected ? 'connected' : 'disconnected';
      access.onstatechange?.({ port: p });
    },
  };
}

export async function withFakeMidi(page: Page, inputs = [M32], outputs = [SYNTH]) {
  await page.addInitScript(installFakeMidi, { inputs, outputs });
}

export async function withoutWebMidi(page: Page) {
  await page.addInitScript(() => {
    delete (Navigator.prototype as { requestMIDIAccess?: unknown }).requestMIDIAccess;
  });
}

/** Send a MIDI message from a fake input (default: the M32). */
export async function sendMidi(page: Page, data: number[], input = M32) {
  await page.evaluate(([name, d]) => (window as any).__midi.send(name, d), [input, data] as const);
}

export async function midiSent(page: Page): Promise<{ port: string; data: number[] }[]> {
  return page.evaluate(() => (window as any).__midi.sent);
}

export async function setConnected(page: Page, name: string, connected: boolean) {
  await page.evaluate(([n, c]) => (window as any).__midi.setConnected(n, c), [name, connected] as const);
}

/** Collects page errors and console errors; assert it is empty at the end of a test. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
  return errors;
}

export async function start(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-overlay').click();
  await page.getByTestId('start-overlay').waitFor({ state: 'hidden' });
}
```

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nopia Web</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the failing browser tests**

Every test in the `describe` block fails if the page logs an error.

Create `e2e/play.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { collectErrors, M32, sendMidi, setConnected, start, withFakeMidi, withoutWebMidi } from './fakeMidi';

test.describe('playing with a fake M32', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('chord keys play chords and the OLED explains them', async ({ page }) => {
    await sendMidi(page, [0x90, 48, 100]); // C
    await expect(page.getByTestId('oled-chord')).toHaveText('C');
    await expect(page.getByTestId('oled-roman')).toHaveText('I');
    await sendMidi(page, [0x90, 49, 100]); // C♯ → A7
    await expect(page.getByTestId('oled-chord')).toHaveText('A7');
    await expect(page.getByTestId('oled-fn')).toHaveText('V7/ii → Dm');
    await expect(page.getByTestId('oled-status')).toHaveText('C major · real · secondary dominants');
  });

  test('chord-zone keys are labelled and relabel live', async ({ page }) => {
    await expect(page.getByTestId('key-49')).toContainText('A7');
    await expect(page.getByTestId('key-49')).toContainText('V7/ii');
    await page.getByTestId('table').click();
    await expect(page.getByTestId('key-49')).toContainText('D♭');
    await page.getByTestId('tonic-2').click();
    await expect(page.getByTestId('key-50')).toContainText('D');
    await expect(page.getByTestId('oled-status')).toHaveText('D major · real · borrowed');
  });

  test('holding the key-select note and pressing a chord key sets the tonic', async ({ page }) => {
    await sendMidi(page, [0x90, 79, 100]);
    await sendMidi(page, [0x90, 55, 100]); // G
    await sendMidi(page, [0x80, 55, 0]);
    await sendMidi(page, [0x80, 79, 0]);
    await expect(page.getByTestId('oled-status')).toContainText('G major');
    await expect(page.getByTestId('tonic-7')).toHaveClass(/active/);
  });

  test('clicking on-screen keys plays chords', async ({ page }) => {
    await page.getByTestId('key-50').dispatchEvent('pointerdown', { pointerId: 1 });
    await expect(page.getByTestId('oled-chord')).toHaveText('Dm');
    await expect(page.getByTestId('key-50')).toHaveClass(/pressed/);
  });

  test('settings survive a reload', async ({ page }) => {
    await page.getByTestId('tonality').click();
    await page.getByTestId('tonic-9').click();
    await page.reload();
    await expect(page.getByTestId('oled-status')).toHaveText('A minor · real · secondary dominants');
  });

  test('unplugging the input shows a hint until it is back', async ({ page }) => {
    await setConnected(page, M32, false);
    await expect(page.getByTestId('banner-input')).toBeVisible();
    await setConnected(page, M32, true);
    await expect(page.getByTestId('banner-input')).toBeHidden();
  });
});

test('without Web MIDI, a banner explains and the on-screen keyboard still works', async ({ page }) => {
  await withoutWebMidi(page);
  await start(page);
  await expect(page.getByTestId('banner-midi')).toContainText('Chrome or Edge');
  await page.getByTestId('key-48').dispatchEvent('pointerdown', { pointerId: 1 });
  await expect(page.getByTestId('oled-chord')).toHaveText('C');
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npm run e2e -- e2e/play.spec.ts --timeout 5000`
Expected: FAIL — 7 failed, each with `locator.click: Test timeout of 5000ms exceeded … waiting for getByTestId('start-overlay')` (`src/main.ts` does not exist yet).

- [ ] **Step 5: Write the DOM helpers**

Create `src/ui/dom.ts`:

```ts
type Handler = (e: Event) => void;
type Attrs = Record<string, string | number | boolean | Handler | undefined>;

/** Create an element: attributes, `on<event>` listeners, then children. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children);
  return el;
}

/** A <select> whose options can be replaced; `onChange` gets the chosen value. */
export function createSelect(attrs: Attrs, onChange: (value: string) => void) {
  const el = h('select', { ...attrs, onchange: () => onChange(el.value) });
  let current = '';
  return {
    el,
    /** Rebuilds the options only when they changed, so an open dropdown is not disturbed. */
    setOptions(options: { value: string; label: string }[], selected: string) {
      const next = JSON.stringify(options);
      if (next !== current) {
        el.replaceChildren(...options.map((o) => h('option', { value: o.value }, o.label)));
        current = next;
      }
      el.value = selected;
    },
  };
}
```

- [ ] **Step 6: Write the knob, OLED and tonal selector**

The knob takes vertical drag (200 px = full range), the wheel and the arrow keys. The tonal selector is a 2-row grid laid out like a piano octave.

Create `src/ui/knob.ts`:

```ts
import type { ControlTarget } from '../core/store';
import { h } from './dom';

export interface Knob {
  el: HTMLElement;
  value(): number;
  set(value: number): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A round knob (0..1): vertical drag, mouse wheel, arrow keys. */
export function createKnob(opts: {
  label: string;
  value: number;
  onInput: (value: number) => void;
  learn?: ControlTarget;
  large?: boolean;
}): Knob {
  let value = opts.value;
  const dial = h('div', {
    class: 'knob-dial',
    role: 'slider',
    tabindex: 0,
    'aria-label': opts.label,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
  });
  const el = h(
    'div',
    { class: opts.large ? 'knob large' : 'knob', 'data-learn': opts.learn },
    dial,
    h('span', { class: 'knob-label' }, opts.label),
  );
  const render = () => {
    dial.style.setProperty('--angle', `${-135 + value * 270}deg`);
    dial.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  };
  const change = (v: number) => {
    value = clamp01(v);
    render();
    opts.onInput(value);
  };
  dial.addEventListener('pointerdown', (e) => {
    const startY = e.clientY;
    const startValue = value;
    dial.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => change(startValue + (startY - ev.clientY) / 200);
    const up = () => {
      dial.removeEventListener('pointermove', move);
      dial.removeEventListener('pointerup', up);
    };
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', up);
  });
  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      change(value - Math.sign(e.deltaY) * 0.04);
    },
    { passive: false },
  );
  dial.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') change(value + 0.05);
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') change(value - 0.05);
  });
  render();
  return {
    el,
    value: () => value,
    set(v: number) {
      value = clamp01(v);
      render();
    },
  };
}
```

Create `src/ui/oled.ts`:

```ts
import type { Settings } from '../core/store';
import { TONIC_NAMES } from '../harmony/spelling';
import type { Chord } from '../harmony/theory';
import { h } from './dom';

/** The OLED-style display: chord name, roman numeral, function, and the current key/mode. */
export function createOled() {
  const name = h('div', { class: 'oled-chord', 'data-testid': 'oled-chord' }, '—');
  const roman = h('div', { class: 'oled-roman', 'data-testid': 'oled-roman' });
  const fn = h('div', { class: 'oled-fn', 'data-testid': 'oled-fn' });
  const status = h('div', { class: 'oled-status', 'data-testid': 'oled-status' });
  const el = h('div', { class: 'oled idle' }, name, roman, fn, status);
  return {
    el,
    /** null = silence: the last chord stays visible, dimmed. */
    showChord(chord: Chord | null) {
      el.classList.toggle('idle', chord === null);
      if (!chord) return;
      name.textContent = chord.name;
      roman.textContent = chord.roman;
      fn.textContent = chord.fn;
    },
    showStatus(s: Settings) {
      const table = s.table === 'secdom' ? 'secondary dominants' : 'borrowed';
      status.textContent = `${TONIC_NAMES[s.tonality][s.tonic]} ${s.tonality} · ${s.layout} · ${table}`;
    },
  };
}
```

Create `src/ui/tonalSelector.ts`:

```ts
import type { Settings, Store } from '../core/store';
import { TONIC_NAMES } from '../harmony/spelling';
import { h } from './dom';

const BLACK = [1, 3, 6, 8, 10];

/** 12 round buttons laid out like a piano octave; clicking one sets the tonic. */
export function createTonalSelector(store: Store) {
  const buttons = Array.from({ length: 12 }, (_, pc) =>
    h('button', {
      class: BLACK.includes(pc) ? 'tonic black' : 'tonic',
      'data-testid': `tonic-${pc}`,
      style: `grid-column: ${2 * [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc] + (BLACK.includes(pc) ? 2 : 1)} / span 2`,
      onclick: () => store.update((s) => (s.tonic = pc)),
    }),
  );
  const el = h('div', { class: 'tonal-selector', 'aria-label': 'Tonic' }, ...buttons);
  return {
    el,
    render(s: Settings) {
      buttons.forEach((b, pc) => {
        b.textContent = TONIC_NAMES[s.tonality][pc];
        b.classList.toggle('active', pc === s.tonic);
      });
    },
  };
}
```

- [ ] **Step 7: Write the keyboard view**

It shows one octave of chord zone below the split and 20 melody keys above (48–79 at the default split, matching the M32). Chord keys are relabelled on every settings change.

Create `src/ui/keyboardView.ts`:

```ts
import type { Settings } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import { pc } from '../harmony/theory';
import type { InputRouter } from '../input/inputRouter';
import { h } from './dom';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * On-screen keyboard: one octave of chord zone below the split, 20 melody keys above.
 * Chord keys show the chord and roman numeral they currently play.
 */
export function createKeyboardView(router: InputRouter) {
  const el = h('div', { class: 'keyboard' });
  const keys = new Map<number, HTMLElement>();
  let builtFor = -1;

  router.onNote((note, on) => keys.get(note)?.classList.toggle('pressed', on));

  function build(split: number) {
    el.replaceChildren();
    keys.clear();
    let whites = 0;
    for (let n = Math.max(0, split - 12); n <= Math.min(127, split + 19); n++) {
      const black = BLACK.has(pc(n));
      const key = h('div', { class: black ? 'key black' : 'key white', 'data-testid': `key-${n}` });
      if (black) key.style.left = `calc(${whites} * var(--white-w) - var(--black-w) / 2)`;
      else whites++;
      key.addEventListener('pointerdown', (e) => {
        key.setPointerCapture(e.pointerId);
        router.noteOn(n, 100);
      });
      const release = () => router.noteOff(n);
      key.addEventListener('pointerup', release);
      key.addEventListener('pointercancel', release);
      keys.set(n, key);
      el.append(key);
    }
    el.style.setProperty('--whites', String(whites));
    builtFor = split;
  }

  return {
    el,
    render(s: Settings) {
      if (builtFor !== s.splitPoint) build(s.splitPoint);
      for (const [n, key] of keys) {
        const chordKey = n < s.splitPoint && n !== s.keySelectNote;
        key.classList.toggle('chord-zone', chordKey);
        key.classList.toggle('key-select', n === s.keySelectNote);
        if (chordKey) {
          const chord = chordForKey(pc(n), s);
          key.replaceChildren(h('span', { class: 'key-chord' }, chord.name), h('span', { class: 'key-roman' }, chord.roman));
        } else {
          key.replaceChildren(n === s.keySelectNote ? h('span', { class: 'key-roman' }, 'key') : '');
        }
      }
    },
  };
}
```

- [ ] **Step 8: Write the panel**

This first version has the header (MIDI in, Panic), banners, the left controls, the OLED, the tonal selector, the keyboard and the start overlay. Tasks 15 and 16 extend it.

Create `src/ui/panel.ts`:

```ts
import type { Bus } from '../core/bus';
import { type ControlTarget, type ModuleId, type Settings, type Store } from '../core/store';
import type { ExtLevel } from '../harmony/theory';
import type { ControlMap } from '../input/controlMap';
import type { InputRouter } from '../input/inputRouter';
import type { MidiPorts } from '../input/midiAccess';
import { createSelect, h } from './dom';
import { createKeyboardView } from './keyboardView';
import { createKnob } from './knob';
import { createOled } from './oled';
import { createTonalSelector } from './tonalSelector';

export interface PanelDeps {
  store: Store;
  bus: Bus;
  router: InputRouter;
  controls: ControlMap;
  ports: () => MidiPorts | null;
  portMissing: (id: ModuleId) => boolean;
  panic: () => void;
  startAudio: () => Promise<void>;
}

export type BannerKind = 'midi' | 'input' | 'feedback';

const levelOf = (v: number) => Math.min(3, Math.floor(v * 4)) as ExtLevel;

export function mountPanel(root: HTMLElement, deps: PanelDeps) {
  const { store, bus, router } = deps;

  // header
  const inputSelect = createSelect({ 'data-testid': 'input-select' }, (v) => store.update((s) => (s.input = v)));
  const header = h(
    'header',
    { class: 'header' },
    h('h1', {}, 'nopia', h('span', {}, ' web')),
    h('label', {}, 'MIDI in ', inputSelect.el),
    h('button', { class: 'panic', 'data-learn': 'panic', 'data-testid': 'panic', onclick: () => deps.panic() }, 'Panic'),
  );
  const banners = h('div', { class: 'banners' });

  // panel
  const toggleButton = (target: ControlTarget, flip: (s: Settings) => void) =>
    h('button', { class: 'toggle', 'data-learn': target, 'data-testid': target, onclick: () => store.update(flip) });
  const layoutButton = toggleButton('layout', (s) => (s.layout = s.layout === 'real' ? 'static' : 'real'));
  const tonalityButton = toggleButton('tonality', (s) => (s.tonality = s.tonality === 'major' ? 'minor' : 'major'));
  const tableButton = toggleButton('table', (s) => (s.table = s.table === 'secdom' ? 'borrowed' : 'secdom'));
  const extKnob = createKnob({
    label: 'Extensions',
    value: (store.get().extLevel + 0.5) / 4,
    learn: 'extensions',
    large: true,
    onInput: (v) => {
      if (levelOf(v) !== store.get().extLevel) store.update((s) => (s.extLevel = levelOf(v)));
    },
  });
  const oled = createOled();
  const tonal = createTonalSelector(store);
  const keyboard = createKeyboardView(router);
  const panel = h(
    'main',
    { class: 'panel' },
    h('div', { class: 'controls' }, layoutButton, tonalityButton, tableButton, extKnob.el),
    oled.el,
    tonal.el,
    keyboard.el,
  );
  const overlay = h(
    'div',
    { class: 'overlay', 'data-testid': 'start-overlay', onclick: () => void deps.startAudio() },
    h('div', {}, 'Click to start audio'),
  );
  root.replaceChildren(header, banners, panel, overlay);

  function render(s: Settings) {
    layoutButton.textContent = s.layout === 'real' ? 'Real' : 'Static';
    tonalityButton.textContent = s.tonality === 'major' ? 'Major' : 'Minor';
    tableButton.textContent = s.table === 'secdom' ? 'Sec. dominants' : 'Borrowed';
    if (levelOf(extKnob.value()) !== s.extLevel) extKnob.set((s.extLevel + 0.5) / 4);
    oled.showStatus(s);
    tonal.render(s);
    keyboard.render(s);
  }
  store.subscribe((s) => render(s));
  render(store.get());

  bus.subscribe((e) => {
    if (e.type === 'chordOn' || e.type === 'chordChange') oled.showChord(e.chord);
    if (e.type === 'chordOff' || e.type === 'panic') oled.showChord(null);
  });

  const bannerEls = new Map<BannerKind, HTMLElement>();
  function setBanner(kind: BannerKind, text: string | null) {
    bannerEls.get(kind)?.remove();
    bannerEls.delete(kind);
    if (text === null) return;
    const el = h('div', { class: `banner ${kind}`, role: 'alert', 'data-testid': `banner-${kind}` }, text);
    bannerEls.set(kind, el);
    banners.append(el);
  }

  return {
    setBanner,
    setAudioRunning: (running: boolean) => void (overlay.hidden = running),
    /** Re-read port lists after hot-plug or a port/input selection change. */
    refreshPorts() {
      const ports = deps.ports();
      if (!ports) return;
      const s = store.get();
      const ins = ports.inputNames();
      const current = ports.currentInput();
      const inputOptions = ins.map((n) => ({ value: n, label: n }));
      if (s.input !== null && !ins.includes(s.input)) inputOptions.push({ value: s.input, label: `${s.input} (missing)` });
      if (inputOptions.length === 0) inputOptions.push({ value: '', label: 'no MIDI inputs' });
      inputSelect.setOptions(inputOptions, current ?? s.input ?? '');

      setBanner('input', current === null ? 'Connect a keyboard — no MIDI input is connected.' : null);
    },
  };
}
```

- [ ] **Step 9: Write the stylesheet**

Sage panel, white knobs, grey-blue round buttons, OLED display (after the Nopia photo). Tasks 15 and 16 append their own sections.

Create `src/ui/style.css`:

```css
:root {
  --wall: #cfcac1;
  --panel: #b4d4a6;
  --panel-shade: #9dbf8f;
  --ink: #23301f;
  --knob: #f3f4ef;
  --knob-shadow: rgba(40, 60, 35, 0.35);
  --button: #8fa3ae;
  --button-ink: #f4f7f8;
  --button-on: #e7f1f4;
  --oled-bg: #0e1513;
  --oled-ink: #c9f6e4;
  --key-white: #e8e9e4;
  --key-black: #c9ccc8;
  --key-pressed: #9fd3c0;
  --chord-zone: #f6f2e2;
  --accent: #e0703a;
  --white-w: 44px;
  --black-w: 28px;
  font-family: system-ui, sans-serif;
  color: var(--ink);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--wall);
}

button, select, input { font: inherit; }

button {
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  background: var(--button);
  color: var(--button-ink);
  cursor: pointer;
}
button.active { background: var(--accent); }

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}
.header h1 { margin: 0 12px 0 0; font-size: 20px; letter-spacing: 0.08em; }
.header h1 span { font-weight: 300; }
.header .panic { background: var(--accent); margin-left: auto; }

.banners { padding: 0 16px; }
.banner { margin: 4px 0; padding: 8px 12px; border-radius: 8px; background: #f7e3c8; }
.banner.feedback { background: #f6d0c8; }

.panel {
  margin: 8px 16px 16px;
  padding: 28px;
  border-radius: 6px;
  background: var(--panel);
  box-shadow: 0 2px 0 var(--panel-shade), 0 12px 30px rgba(0, 0, 0, 0.15);
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas:
    "controls oled tonal"
    "keyboard keyboard modules";
  gap: 28px;
  align-items: start;
}

.controls { grid-area: controls; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.toggle { width: 160px; white-space: nowrap; }

.knob { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; }
.knob-dial {
  --size: 44px;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--knob);
  box-shadow: 0 3px 6px var(--knob-shadow);
  position: relative;
  cursor: ns-resize;
  touch-action: none;
}
.knob.large .knob-dial { --size: 84px; }
.knob-dial::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 8%;
  width: 2px;
  height: 34%;
  background: var(--ink);
  transform-origin: 50% 124%;
  transform: translateX(-50%) rotate(var(--angle));
}

.oled {
  grid-area: oled;
  justify-self: center;
  min-width: 300px;
  padding: 14px 18px;
  border-radius: 6px;
  background: var(--oled-bg);
  color: var(--oled-ink);
  font-family: ui-monospace, monospace;
}
.oled.idle .oled-chord, .oled.idle .oled-roman, .oled.idle .oled-fn { opacity: 0.4; }
.oled-chord { font-size: 40px; line-height: 1.1; }
.oled-roman { font-size: 20px; }
.oled-fn { font-size: 14px; min-height: 1.2em; }
.oled-status { margin-top: 8px; font-size: 12px; opacity: 0.8; }

.tonal-selector {
  grid-area: tonal;
  display: grid;
  grid-template-columns: repeat(15, 18px);
  grid-auto-rows: 40px;
  gap: 4px 0;
}
.tonic { grid-row: 2; width: 36px; height: 36px; padding: 0; font-size: 11px; }
.tonic.black { grid-row: 1; }
.tonic.active { background: var(--button-on); color: var(--ink); box-shadow: 0 0 0 2px var(--accent); }

.keyboard {
  grid-area: keyboard;
  position: relative;
  display: flex;
  width: calc(var(--whites) * var(--white-w));
  height: 170px;
  user-select: none;
}
.key { touch-action: none; cursor: pointer; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; font-size: 10px; padding-bottom: 6px; }
.key.white {
  width: var(--white-w);
  height: 100%;
  background: var(--key-white);
  border: 1px solid #555;
  border-radius: 0 0 4px 4px;
}
.key.black {
  position: absolute;
  top: 0;
  z-index: 1;
  width: var(--black-w);
  height: 60%;
  background: var(--key-black);
  border: 1px solid #555;
  border-radius: 0 0 3px 3px;
  font-size: 8px;
}
.key.chord-zone.white { background: var(--chord-zone); }
.key.key-select { outline: 2px dashed var(--accent); outline-offset: -4px; }
.key.pressed { background: var(--key-pressed) !important; }
.key-chord { font-weight: 600; }
.key-roman { opacity: 0.7; }

.overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  background: rgba(30, 40, 30, 0.55);
  color: white;
  font-size: 24px;
  cursor: pointer;
}
.overlay[hidden], [hidden] { display: none !important; }

@media (max-width: 1100px) {
  .panel {
    grid-template-columns: 1fr;
    grid-template-areas: "controls" "oled" "tonal" "keyboard" "modules";
  }
  .keyboard { overflow-x: auto; max-width: 100%; }
}
```

- [ ] **Step 10: Wire everything in main.ts**

`main.ts` is the composition root. Panic emits `panic` on the bus (modules stop their sinks) and clears the engine's and router's held state. Hiding the page and losing the input both trigger panic. Task 16 adds MIDI-monitor logging to `onMessage`.

Create `src/main.ts`:

```ts
import * as Tone from 'tone';
import { Bus } from './core/bus';
import { MODULE_IDS, Store } from './core/store';
import { ChordEngine } from './harmony/chordEngine';
import { ControlMap } from './input/controlMap';
import { InputRouter } from './input/inputRouter';
import { pickInput, requestMidi, type MidiPorts } from './input/midiAccess';
import { BassModule } from './modules/bass';
import { KeysModule } from './modules/keys';
import { MelodyModule } from './modules/melody';
import { PadModule } from './modules/pad';
import { Master } from './sound/master';
import { ModuleOutputs } from './sound/moduleOutputs';
import { createVoice } from './sound/presets';
import { ToneSink } from './sound/toneSink';
import { mountPanel } from './ui/panel';
import './ui/style.css';

const UNSUPPORTED = 'This browser has no Web MIDI. Use Chrome or Edge — the on-screen keyboard still works.';
const DENIED =
  'MIDI access was blocked. Click the site-settings icon left of the address, allow “MIDI devices”, then reload.';

Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = new Store(browserStorage());
const bus = new Bus();
const engine = new ChordEngine(() => store.get(), (e) => bus.emit(e));
const master = new Master();
let midi: MidiPorts | null = null;
const outputs = new ModuleOutputs({
  internal: (id, preset) =>
    new ToneSink(createVoice(preset), id === 'keys' || id === 'pad' ? master.toneInput : master.input, id === 'melody'),
  midiPort: (name) => midi?.output(name) ?? null,
});
const modules = [
  new KeysModule(outputs.sink('keys')),
  new PadModule(outputs.sink('pad')),
  new BassModule(outputs.sink('bass')),
  new MelodyModule(outputs.sink('melody')),
];
bus.subscribe((e) => {
  for (const m of modules) m.handle(e);
});

function panic(): void {
  bus.emit({ type: 'panic' });
  engine.reset();
  router.reset();
}

const controls = new ControlMap(store, { panic });
const router = new InputRouter({ engine, bus, store, controls });

const HARMONY_KEYS = ['tonic', 'tonality', 'layout', 'table', 'extLevel'] as const;
store.subscribe((next, prev) => {
  if (HARMONY_KEYS.some((k) => next[k] !== prev[k])) engine.settingsChanged();
  outputs.sync(next);
  master.apply(next.master);
});
outputs.sync(store.get());
master.apply(store.get().master);

const ui = mountPanel(document.querySelector<HTMLElement>('#app')!, {
  store,
  bus,
  router,
  controls,
  ports: () => midi,
  portMissing: (id) => outputs.portMissing(id),
  panic,
  startAudio: () => Tone.start(),
});

const context = Tone.getContext();
ui.setAudioRunning(context.state === 'running');
context.on('statechange', () => ui.setAudioRunning(context.state === 'running'));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) panic();
});

void requestMidi(navigator).then((result) => {
  if ('error' in result) {
    ui.setBanner('midi', result.error === 'unsupported' ? UNSUPPORTED : DENIED);
    return;
  }
  const ports = result.ports;
  midi = ports;
  ports.onMessage((data) => router.handleMidi(data));
  const refresh = () => {
    const hadInput = ports.currentInput() !== null;
    const hasInput = ports.useInput(pickInput(ports.inputNames(), store.get().input));
    if (hadInput && !hasInput) panic();
    outputs.sync(store.get());
    ui.refreshPorts();
  };
  ports.onChange(refresh);
  store.subscribe((next, prev) => {
    if (next.input !== prev.input || MODULE_IDS.some((id) => next.modules[id].port !== prev.modules[id].port)) refresh();
  });
  refresh();
});
```

- [ ] **Step 11: Run the browser tests**

Run: `npm run e2e -- e2e/play.spec.ts`
Expected: PASS (7 tests). Vite's log shows Tone's "AudioContext is suspended" warning before the overlay click; that is expected.

- [ ] **Step 12: Run unit tests, typecheck and build**

Run: `npm test && npm run build`
Expected: every unit test passes; `vite build` prints `✓ built`.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json playwright.config.ts e2e index.html src/main.ts src/ui
git commit -m "Add playable panel: OLED, tonal selector, keyboard view, Web MIDI wiring"
```

---

### Task 15: Module strip, MIDI out selection and output warnings (§5, §7, §8)

**Files:**
- Create: `src/ui/moduleStrip.ts`
- Modify: `src/ui/panel.ts`
- Modify: `src/ui/style.css` (append)
- Test: `e2e/modules.spec.ts`

**Interfaces:**
- Consumes: `createSelect`, `h`, `createKnob` (Task 14); `MODULE_IDS`, `PRESET_CHOICES`, `ModuleSettings`, `Store` (Task 7); `ModuleOutputs.portMissing` via `PanelDeps.portMissing` (Task 14)
- Produces: `createModuleStrip({store, outputNames, portMissing}) → {el, render(settings)}`; test ids `module-<id>`, `<id>-open`, `<id>-enabled`, `<id>-sound`, `<id>-preset`, `<id>-port`, `<id>-channel`, `output-all`, `banner-feedback`.

- [ ] **Step 1: Write the failing browser tests**

These pin Review Focus #1 (hiding the page or unplugging the input silences notes) and #2 (fast changes never hit the polyphony cap). `every preset builds and plays` is the first real-browser run of every Tone preset.

Create `e2e/modules.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { collectErrors, M32, midiSent, sendMidi, setConnected, start, SYNTH, withFakeMidi } from './fakeMidi';

const sentBytes = async (page: Parameters<typeof midiSent>[0]) => (await midiSent(page)).map((m) => m.data.join(','));

test.describe('modules and MIDI out', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('every preset builds and plays', async ({ page }) => {
    const presets = { keys: ['organ', 'pluck', 'epiano'], pad: ['glass', 'warmPad'], bass: ['sawBass', 'sub'], melody: ['leadGlide', 'lead'] };
    for (const [id, ids] of Object.entries(presets)) {
      await page.getByTestId(`${id}-open`).click();
      for (const preset of ids) {
        await page.getByTestId(`${id}-preset`).selectOption(preset);
        await sendMidi(page, [0x90, 48, 100]);
        await sendMidi(page, [0x90, 72, 100]);
        await sendMidi(page, [0xe0, 0, 100]);
        await sendMidi(page, [0xb0, 1, 90]);
        await sendMidi(page, [0x80, 48, 0]);
        await sendMidi(page, [0x80, 72, 0]);
      }
    }
    await expect(page.getByTestId('oled-chord')).toHaveText('C');
  });

  test('fast chord changes at full extensions never drop notes', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => void (m.type() === 'warning' && warnings.push(m.text())));
    await sendMidi(page, [0xb0, 14, 127]); // Extensions to max (default binding CC14)
    for (let i = 0; i < 16; i++) {
      const note = 48 + ((i * 5) % 12);
      await sendMidi(page, [0x90, note, 100]);
      await page.waitForTimeout(240); // ~4 chords per second
      await sendMidi(page, [0x80, note, 0]);
    }
    expect(warnings.filter((w) => /polyphony/i.test(w))).toEqual([]);
  });

  test('modules send MIDI on their own channels; panic sends note-offs and CC123', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await page.getByTestId('bass-open').click();
    await page.getByTestId('bass-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]); // C
    await expect.poll(() => sentBytes(page)).toEqual(
      expect.arrayContaining(['144,60,100', '144,64,100', '144,67,100', '145,36,100']),
    );
    await page.getByTestId('panic').click();
    expect(await sentBytes(page)).toEqual(
      expect.arrayContaining(['128,60,0', '128,64,0', '128,67,0', '176,123,0', '129,36,0', '177,123,0']),
    );
    await expect(page.getByTestId('oled-chord')).toHaveText('C'); // last chord stays, dimmed
  });

  test('melody notes and pitch bend go out on channel 5', async ({ page }) => {
    await page.getByTestId('melody-open').click();
    await page.getByTestId('melody-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 72, 90]);
    await sendMidi(page, [0xe0, 0, 96]);
    await expect.poll(() => sentBytes(page)).toEqual(expect.arrayContaining(['148,72,90', '228,0,96']));
  });

  test('hiding the page silences held notes', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await sentBytes(page)).toEqual(expect.arrayContaining(['128,60,0', '128,64,0', '128,67,0', '176,123,0']));
  });

  test('unplugging the input silences held notes', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await sendMidi(page, [0x90, 48, 100]);
    await setConnected(page, M32, false);
    expect(await sentBytes(page)).toEqual(expect.arrayContaining(['128,60,0', '176,123,0']));
  });

  test('a vanished output port falls back to internal sound with a warning badge', async ({ page }) => {
    await page.getByTestId('keys-open').click();
    await page.getByTestId('keys-port').selectOption(SYNTH);
    await setConnected(page, SYNTH, false);
    await expect(page.getByTestId('module-keys').locator('.badge')).toBeVisible();
    await setConnected(page, SYNTH, true);
    await expect(page.getByTestId('module-keys').locator('.badge')).toBeHidden();
  });
});

test('selecting the same port as input and output warns about feedback', async ({ page }) => {
  await withFakeMidi(page, ['Bome'], ['Bome']);
  await start(page);
  await page.getByTestId('output-all').selectOption('Bome');
  await expect(page.getByTestId('banner-feedback')).toBeVisible();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run e2e -- e2e/modules.spec.ts --timeout 10000`
Expected: FAIL — 7 of 8 tests time out on `getByTestId('<id>-open')` or `getByTestId('output-all')`. `fast chord changes at full extensions never drop notes` already passes, because Task 13 set `maxPolyphony = 64`. With Tone's default it fails with `Max polyphony exceeded. Note dropped.`

- [ ] **Step 3: Write the module strip**

Each module has a volume knob (learnable as `vol.<id>`) and a `<details>` panel: enabled, internal sound, preset, MIDI port, channel. A stored port that is not connected stays listed as `(missing)`, and the ⚠ badge shows while the module falls back to internal sound.

Create `src/ui/moduleStrip.ts`:

```ts
import { MODULE_IDS, PRESET_CHOICES, type ModuleId, type ModuleSettings, type Settings, type Store } from '../core/store';
import { createSelect, h } from './dom';
import { createKnob } from './knob';

const NAMES: Record<ModuleId, string> = { keys: 'Keys', pad: 'Pad', bass: 'Bass', melody: 'Melody' };
const CHANNELS = Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: `ch ${i + 1}` }));

/** A volume knob per module; the module name opens its settings. */
export function createModuleStrip(deps: {
  store: Store;
  outputNames: () => string[];
  portMissing: (id: ModuleId) => boolean;
}) {
  const { store } = deps;
  const set = (id: ModuleId, patch: Partial<ModuleSettings>) =>
    store.update((s) => Object.assign(s.modules[id], patch));

  const items = MODULE_IDS.map((id) => {
    const knob = createKnob({ label: 'vol', value: store.get().modules[id].volume, learn: `vol.${id}`, onInput: (v) => set(id, { volume: v }) });
    const enabled = h('input', { type: 'checkbox', 'data-testid': `${id}-enabled`, onchange: () => set(id, { enabled: enabled.checked }) });
    const sound = h('input', { type: 'checkbox', 'data-testid': `${id}-sound`, onchange: () => set(id, { sound: sound.checked }) });
    const preset = createSelect({ 'data-testid': `${id}-preset` }, (v) => set(id, { preset: v }));
    const port = createSelect({ 'data-testid': `${id}-port` }, (v) => set(id, { port: v === '' ? null : v }));
    const channel = createSelect({ 'data-testid': `${id}-channel` }, (v) => set(id, { channel: Number(v) }));
    const badge = h('span', { class: 'badge', title: 'MIDI port missing — using internal sound', hidden: true }, '⚠');
    const details = h(
      'details',
      { class: 'module-settings' },
      h('summary', { 'data-testid': `${id}-open` }, NAMES[id], badge),
      h('label', {}, enabled, ' enabled'),
      h('label', {}, sound, ' internal sound'),
      h('label', {}, 'preset ', preset.el),
      h('label', {}, 'MIDI out ', port.el),
      h('label', {}, 'channel ', channel.el),
    );
    const el = h('div', { class: 'module', 'data-testid': `module-${id}` }, knob.el, details);
    return { id, el, knob, enabled, sound, preset, port, channel, badge };
  });

  return {
    el: h('div', { class: 'module-strip' }, ...items.map((i) => i.el)),
    render(s: Settings) {
      const outs = deps.outputNames();
      for (const it of items) {
        const m = s.modules[it.id];
        if (Math.abs(it.knob.value() - m.volume) > 1e-6) it.knob.set(m.volume);
        it.enabled.checked = m.enabled;
        it.sound.checked = m.sound;
        it.el.classList.toggle('disabled', !m.enabled);
        it.preset.setOptions(PRESET_CHOICES[it.id].map((p) => ({ value: p.id, label: p.label })), m.preset);
        const names = m.port !== null && !outs.includes(m.port) ? [...outs, m.port] : outs;
        it.port.setOptions(
          [{ value: '', label: '— none —' }, ...names.map((n) => ({ value: n, label: outs.includes(n) ? n : `${n} (missing)` }))],
          m.port ?? '',
        );
        it.channel.setOptions(CHANNELS, String(m.channel));
        it.badge.hidden = !deps.portMissing(it.id);
      }
    },
  };
}
```

- [ ] **Step 4: Add the strip, the MIDI-out selector and the feedback warning to the panel**

In `src/ui/panel.ts`, replace:

```ts
import { type ControlTarget, type ModuleId, type Settings, type Store } from '../core/store';
```

with:

```ts
import { MODULE_IDS, type ControlTarget, type ModuleId, type Settings, type Store } from '../core/store';
```

In `src/ui/panel.ts`, replace:

```ts
import { createKnob } from './knob';
import { createOled } from './oled';
```

with:

```ts
import { createKnob } from './knob';
import { createModuleStrip } from './moduleStrip';
import { createOled } from './oled';
```

In `src/ui/panel.ts`, replace:

```ts
  const inputSelect = createSelect({ 'data-testid': 'input-select' }, (v) => store.update((s) => (s.input = v)));
```

with:

```ts
  const inputSelect = createSelect({ 'data-testid': 'input-select' }, (v) => store.update((s) => (s.input = v)));
  const outputSelect = createSelect({ 'data-testid': 'output-all' }, (v) => {
    if (v !== '*') store.update((s) => MODULE_IDS.forEach((id) => (s.modules[id].port = v === '' ? null : v)));
  });
```

In `src/ui/panel.ts`, replace:

```ts
    h('label', {}, 'MIDI in ', inputSelect.el),
```

with:

```ts
    h('label', {}, 'MIDI in ', inputSelect.el),
    h('label', {}, 'MIDI out (all) ', outputSelect.el),
```

In `src/ui/panel.ts`, replace:

```ts
  const keyboard = createKeyboardView(router);
```

with:

```ts
  const keyboard = createKeyboardView(router);
  const strip = createModuleStrip({
    store,
    outputNames: () => deps.ports()?.outputNames() ?? [],
    portMissing: deps.portMissing,
  });
```

In `src/ui/panel.ts`, replace:

```ts
    keyboard.el,
  );
```

with:

```ts
    keyboard.el,
    strip.el,
  );
```

In `src/ui/panel.ts`, replace:

```ts
    keyboard.render(s);
  }
```

with:

```ts
    keyboard.render(s);
    strip.render(s);
  }
```

In `src/ui/panel.ts`, replace:

```ts
      setBanner('input', current === null ? 'Connect a keyboard — no MIDI input is connected.' : null);
    },
```

with:

```ts
      setBanner('input', current === null ? 'Connect a keyboard — no MIDI input is connected.' : null);

      const outs = ports.outputNames();
      const chosen = new Set(MODULE_IDS.map((id) => s.modules[id].port ?? ''));
      const outOptions = [{ value: '', label: '— none —' }, ...outs.map((n) => ({ value: n, label: n }))];
      if (chosen.size > 1) outOptions.unshift({ value: '*', label: '(per module)' });
      outputSelect.setOptions(outOptions, chosen.size > 1 ? '*' : [...chosen][0]);
      const loop = current !== null && MODULE_IDS.some((id) => s.modules[id].port === current);
      setBanner('feedback', loop ? `“${current}” is both the MIDI input and a module output — this can cause a feedback loop.` : null);
      strip.render(s);
    },
```

- [ ] **Step 5: Append the module-strip styles**

Append to `src/ui/style.css`:

```css
.module-strip { grid-area: modules; display: grid; grid-template-columns: repeat(2, auto); gap: 16px; }
.module { display: flex; gap: 8px; align-items: flex-start; }
.module.disabled { opacity: 0.5; }
.module-settings summary { cursor: pointer; font-weight: 600; }
.module-settings label { display: block; font-size: 12px; margin: 4px 0; }
.badge { margin-left: 4px; color: var(--accent); }
```

- [ ] **Step 6: Run the browser tests**

Run: `npm run e2e -- e2e/play.spec.ts e2e/modules.spec.ts`
Expected: PASS (15 tests).

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: `tsc` prints nothing.

```bash
git add src/ui/moduleStrip.ts src/ui/panel.ts src/ui/style.css e2e/modules.spec.ts
git commit -m "Add module strip with per-module MIDI out and port warnings"
```

---

### Task 16: Settings drawer, MIDI learn mode and MIDI monitor (§4.3, §7)

**Files:**
- Create: `src/ui/midiMonitor.ts`
- Test: `src/ui/midiMonitor.test.ts`
- Create: `src/ui/settings.ts`
- Modify: `src/ui/panel.ts`, `src/main.ts`
- Modify: `src/ui/style.css` (append)
- Test: `e2e/settings.spec.ts`

**Interfaces:**
- Consumes: `ControlMap` (`arm`, `armedTarget`, `onArmedChange`, `setMode`, `unbind`), `TARGET_INFO` (Task 8); `InputRouter.captureNextNote` (Task 9); `midiNoteName` (Task 1); UI helpers (Task 14)
- Produces: `describeMidi(data): string | null`; `createMidiMonitor() → {el, toggle(), log(data)}`; `createSettings({store, router, controls}) → {el, toggle(), render(settings)}`; panel gains `logMidi(data)`; test ids `monitor-toggle`, `monitor`, `learn-toggle`, `settings-toggle`, `settings`, `split-point`, `key-select`, `binding-<target>`, `learn-<target>`.

- [ ] **Step 1: Write the failing monitor test**

Create `src/ui/midiMonitor.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeMidi } from './midiMonitor';

describe('describeMidi', () => {
  it('describes notes with channel, number and name', () => {
    expect(describeMidi([0x90, 60, 100])).toBe('Note on    ch1  60 C4  vel 100');
    expect(describeMidi([0x91, 60, 0])).toBe('Note off   ch2  60 C4');
    expect(describeMidi([0x80, 48, 0])).toBe('Note off   ch1  48 C3');
  });

  it('describes CCs and pitch bend', () => {
    expect(describeMidi([0xb0, 14, 65])).toBe('CC         ch1  #14 = 65');
    expect(describeMidi([0xe0, 0, 64])).toBe('Pitch bend ch1  8192');
  });

  it('hides clock and active sensing', () => {
    expect(describeMidi([0xf8])).toBeNull();
    expect(describeMidi([0xfe])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ui/midiMonitor.test.ts`
Expected: FAIL — `Error: Cannot find module './midiMonitor'`

- [ ] **Step 3: Implement the monitor**

Clock (0xF8) and active sensing (0xFE) are hidden: the M32 may send them continuously. The monitor only logs while it is open.

Create `src/ui/midiMonitor.ts`:

```ts
import { midiNoteName } from '../harmony/theory';
import { h } from './dom';

const MAX_LINES = 200;

/** One-line description of a MIDI message; null for clock/active-sensing noise. */
export function describeMidi(data: ArrayLike<number>): string | null {
  const status = data[0];
  if (status === 0xf8 || status === 0xfe) return null;
  if (status >= 0xf0) return `System 0x${status.toString(16)}`;
  const ch = `ch${(status & 0x0f) + 1}`;
  const [d1, d2] = [data[1], data[2]];
  switch (status & 0xf0) {
    case 0x90:
      if (d2 > 0) return `Note on    ${ch}  ${d1} ${midiNoteName(d1)}  vel ${d2}`;
      return `Note off   ${ch}  ${d1} ${midiNoteName(d1)}`;
    case 0x80:
      return `Note off   ${ch}  ${d1} ${midiNoteName(d1)}`;
    case 0xb0:
      return `CC         ${ch}  #${d1} = ${d2}`;
    case 0xe0:
      return `Pitch bend ${ch}  ${(d2 << 7) | d1}`;
    case 0xd0:
      return `Aftertouch ${ch}  ${d1}`;
    case 0xa0:
      return `Poly AT    ${ch}  ${d1} = ${d2}`;
    default:
      return `Program    ${ch}  ${d1}`;
  }
}

/** Scrolling log of incoming MIDI, newest first. */
export function createMidiMonitor() {
  const list = h('ol', { class: 'monitor-lines', 'data-testid': 'monitor' });
  const el = h('section', { class: 'monitor', hidden: true }, h('h2', {}, 'MIDI monitor'), list);
  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
    },
    log(data: ArrayLike<number>) {
      if (el.hidden) return;
      const text = describeMidi(data);
      if (text === null) return;
      list.prepend(h('li', {}, text));
      while (list.childElementCount > MAX_LINES) list.lastElementChild!.remove();
    },
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/ui/midiMonitor.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/midiMonitor.ts src/ui/midiMonitor.test.ts
git commit -m "Add MIDI message formatting and monitor view"
```

- [ ] **Step 6: Write the failing browser tests**

The learn-mode test sends 100 after binding, not 127: right after learning, 127 is ambiguous (it could be a relative −1), so `auto` mode applies it as relative (Decision 12).

Create `e2e/settings.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { collectErrors, sendMidi, start, withFakeMidi } from './fakeMidi';

test.describe('settings, learn and monitor', () => {
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = collectErrors(page);
    await withFakeMidi(page);
    await start(page);
  });

  test.afterEach(() => {
    expect(errors).toEqual([]);
  });

  test('the mapping list learns a hardware CC', async ({ page }) => {
    await page.getByTestId('settings-toggle').click();
    await page.getByTestId('learn-reverb').click();
    await sendMidi(page, [0xb0, 30, 64]);
    await expect(page.getByTestId('binding-reverb')).toHaveText('CC 30 · ch 1');
  });

  test('learn mode: click a control, then move a hardware control', async ({ page }) => {
    await page.getByTestId('learn-toggle').click();
    const ext = page.locator('.controls [data-learn="extensions"]');
    await ext.click();
    await expect(ext).toHaveClass(/armed/);
    await sendMidi(page, [0xb1, 40, 0]);
    await expect(ext).not.toHaveClass(/armed/);
    await sendMidi(page, [0xb1, 40, 100]); // now bound; 100 is unambiguously absolute → level 3
    await sendMidi(page, [0x90, 48, 100]);
    await expect(page.getByTestId('oled-chord')).toHaveText('Cmaj13');
    await page.getByTestId('settings-toggle').click();
    await expect(page.getByTestId('binding-extensions')).toHaveText('CC 40 · ch 2');
  });

  test('press-a-key sets the split point', async ({ page }) => {
    await page.getByTestId('settings-toggle').click();
    await page.getByTestId('split-point').locator('..').getByRole('button').click();
    await sendMidi(page, [0x90, 64, 100]);
    await expect(page.getByTestId('split-point')).toHaveValue('64');
    await sendMidi(page, [0x90, 62, 100]); // now in the chord zone: D → Dm
    await expect(page.getByTestId('oled-chord')).toHaveText('Dm');
  });

  test('the MIDI monitor shows incoming messages', async ({ page }) => {
    await page.getByTestId('monitor-toggle').click();
    await sendMidi(page, [0xb0, 14, 65]);
    await expect(page.getByTestId('monitor')).toContainText('CC         ch1  #14 = 65');
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npm run e2e -- e2e/settings.spec.ts --timeout 5000`
Expected: FAIL — all 4 tests time out on `settings-toggle`, `learn-toggle` or `monitor-toggle`.

- [ ] **Step 8: Write the settings drawer**

It contains the split point and key-select note (number field or "press a key"), the master knobs (learnable), and the mapping list (binding, mode, learn, clear). The mode selector is disabled for toggles and Panic, which ignore it.

Create `src/ui/settings.ts`:

```ts
import { CONTROL_TARGETS, type EncoderMode, type Settings, type Store } from '../core/store';
import { midiNoteName } from '../harmony/theory';
import { TARGET_INFO, type ControlMap } from '../input/controlMap';
import type { InputRouter } from '../input/inputRouter';
import { createSelect, h } from './dom';
import { createKnob, type Knob } from './knob';

const MODES = [
  { value: 'detect', label: 'auto' },
  { value: 'absolute', label: 'absolute' },
  { value: 'relative', label: 'relative' },
];

/** Settings drawer: split point, key-select note, control mappings, master FX. */
export function createSettings(deps: { store: Store; router: InputRouter; controls: ControlMap }) {
  const { store, router, controls } = deps;

  function noteField(label: string, testid: string, field: 'splitPoint' | 'keySelectNote') {
    const input = h('input', {
      type: 'number', min: 0, max: 127, 'data-testid': testid,
      onchange: () => {
        const n = Number(input.value);
        if (Number.isInteger(n) && n >= 0 && n <= 127) store.update((s) => (s[field] = n));
      },
    });
    const name = h('span', { class: 'note-name' });
    const press = h('button', {
      type: 'button',
      onclick: () => {
        press.textContent = 'waiting…';
        router.captureNextNote((n) => {
          press.textContent = 'press a key';
          store.update((s) => (s[field] = n));
        });
      },
    }, 'press a key');
    return { el: h('label', { class: 'note-field' }, label, input, name, press), input, name, field };
  }
  const noteFields = [
    noteField('Split point', 'split-point', 'splitPoint'),
    noteField('Key-select note', 'key-select', 'keySelectNote'),
  ];

  const rows = CONTROL_TARGETS.map((target) => {
    const binding = h('td', { 'data-testid': `binding-${target}` });
    const mode = createSelect({}, (v) => controls.setMode(target, v as EncoderMode));
    const learn = h('button', { type: 'button', 'data-testid': `learn-${target}`, onclick: () => controls.arm(controls.armedTarget() === target ? null : target) }, 'learn');
    const clear = h('button', { type: 'button', onclick: () => controls.unbind(target) }, 'clear');
    const el = h('tr', {}, h('td', {}, TARGET_INFO[target].label), binding, h('td', {}, mode.el), h('td', {}, learn, clear));
    return { target, el, binding, mode, learn };
  });

  const masterKnobs: [Knob, (s: Settings) => number][] = [
    [createKnob({ label: 'Reverb', value: 0, learn: 'reverb', onInput: (v) => store.update((s) => (s.master.reverb = v)) }), (s) => s.master.reverb],
    [createKnob({ label: 'Delay', value: 0, learn: 'delay', onInput: (v) => store.update((s) => (s.master.delay = v)) }), (s) => s.master.delay],
    [createKnob({ label: 'Tone', value: 0, learn: 'tone', onInput: (v) => store.update((s) => (s.master.tone = v)) }), (s) => s.master.tone],
    [createKnob({ label: 'Master', value: 0, learn: 'master', onInput: (v) => store.update((s) => (s.master.volume = v)) }), (s) => s.master.volume],
  ];

  const el = h(
    'aside',
    { class: 'drawer', hidden: true, 'data-testid': 'settings' },
    h('h2', {}, 'Settings'),
    ...noteFields.map((f) => f.el),
    h('h3', {}, 'Master'),
    h('div', { class: 'master-knobs' }, ...masterKnobs.map(([k]) => k.el)),
    h('h3', {}, 'Control mappings'),
    h('table', { class: 'mappings' }, h('tbody', {}, ...rows.map((r) => r.el))),
  );

  function renderArmed() {
    const armed = controls.armedTarget();
    for (const r of rows) r.learn.classList.toggle('armed', r.target === armed);
  }
  controls.onArmedChange(renderArmed);

  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
    },
    render(s: Settings) {
      for (const f of noteFields) {
        if (document.activeElement !== f.input) f.input.value = String(s[f.field]);
        f.name.textContent = midiNoteName(s[f.field]);
      }
      for (const [knob, get] of masterKnobs) if (Math.abs(knob.value() - get(s)) > 1e-6) knob.set(get(s));
      for (const r of rows) {
        const b = s.bindings.find((x) => x.target === r.target);
        r.binding.textContent = b ? `CC ${b.cc} · ch ${b.channel}` : '—';
        r.mode.setOptions(MODES, b?.mode ?? 'detect');
        r.mode.el.disabled = !b || ['toggle', 'trigger'].includes(TARGET_INFO[r.target].kind);
      }
      renderArmed();
    },
  };
}
```

- [ ] **Step 9: Add the drawer, learn mode and monitor to the panel**

Learn mode is generic: while it is on, a capture-phase `pointerdown` on any `[data-learn]` element arms that target instead of operating the control, and the matching `click` is swallowed.

In `src/ui/panel.ts`, replace:

```ts
import { createKnob } from './knob';
import { createModuleStrip } from './moduleStrip';
import { createOled } from './oled';
import { createTonalSelector } from './tonalSelector';
```

with:

```ts
import { createKnob } from './knob';
import { createMidiMonitor } from './midiMonitor';
import { createModuleStrip } from './moduleStrip';
import { createOled } from './oled';
import { createSettings } from './settings';
import { createTonalSelector } from './tonalSelector';
```

In `src/ui/panel.ts`, replace:

```ts
  const { store, bus, router } = deps;
```

with:

```ts
  const { store, bus, router, controls } = deps;
```

In `src/ui/panel.ts`, replace:

```ts
    if (v !== '*') store.update((s) => MODULE_IDS.forEach((id) => (s.modules[id].port = v === '' ? null : v)));
  });
```

with:

```ts
    if (v !== '*') store.update((s) => MODULE_IDS.forEach((id) => (s.modules[id].port = v === '' ? null : v)));
  });
  const learnButton = h('button', { 'data-testid': 'learn-toggle', onclick: () => setLearning(!learning) }, 'Learn');
  const monitor = createMidiMonitor();
  const settings = createSettings({ store, router, controls });
```

In `src/ui/panel.ts`, replace:

```ts
    h('button', { class: 'panic', 'data-learn': 'panic', 'data-testid': 'panic', onclick: () => deps.panic() }, 'Panic'),
```

with:

```ts
    h('button', { 'data-testid': 'monitor-toggle', onclick: () => monitor.toggle() }, 'Monitor'),
    learnButton,
    h('button', { 'data-testid': 'settings-toggle', onclick: () => settings.toggle() }, 'Settings'),
    h('button', { class: 'panic', 'data-learn': 'panic', 'data-testid': 'panic', onclick: () => deps.panic() }, 'Panic'),
```

In `src/ui/panel.ts`, replace:

```ts
  root.replaceChildren(header, banners, panel, overlay);
```

with:

```ts
  root.replaceChildren(header, banners, panel, settings.el, monitor.el, overlay);

  // learn mode: clicking a [data-learn] control arms it instead of using it
  let learning = false;
  function setLearning(on: boolean) {
    learning = on;
    root.classList.toggle('learning', on);
    learnButton.classList.toggle('active', on);
    if (!on) controls.arm(null);
  }
  root.addEventListener(
    'pointerdown',
    (e) => {
      const target = learning && (e.target as Element).closest<HTMLElement>('[data-learn]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      controls.arm(target.dataset.learn as ControlTarget);
    },
    true,
  );
  root.addEventListener(
    'click',
    (e) => {
      if (learning && (e.target as Element).closest('[data-learn]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  controls.onArmedChange(() => {
    const armed = controls.armedTarget();
    for (const el of root.querySelectorAll<HTMLElement>('[data-learn]')) {
      el.classList.toggle('armed', el.dataset.learn === armed);
    }
  });
```

In `src/ui/panel.ts`, replace:

```ts
    strip.render(s);
  }
```

with:

```ts
    strip.render(s);
    settings.render(s);
  }
```

In `src/ui/panel.ts`, replace:

```ts
    setBanner,
```

with:

```ts
    setBanner,
    logMidi: (data: ArrayLike<number>) => monitor.log(data),
```

- [ ] **Step 10: Log incoming MIDI to the monitor**

In `src/main.ts`, replace:

```ts
  ports.onMessage((data) => router.handleMidi(data));
```

with:

```ts
  ports.onMessage((data) => {
    router.handleMidi(data);
    ui.logMidi(data);
  });
```

- [ ] **Step 11: Append the drawer, monitor and learn styles**

Append to `src/ui/style.css`:

```css
.drawer {
  margin: 0 16px 16px;
  padding: 16px;
  border-radius: 6px;
  background: #eef0ea;
}
.drawer h2, .monitor h2 { margin-top: 0; font-size: 16px; }
.note-field { display: flex; gap: 8px; align-items: center; margin: 6px 0; }
.note-field input { width: 70px; }
.master-knobs { display: flex; gap: 20px; }
.mappings td { padding: 2px 8px; font-size: 13px; }
.mappings button { padding: 2px 10px; font-size: 12px; }

.monitor { margin: 0 16px 16px; padding: 12px 16px; border-radius: 6px; background: var(--oled-bg); color: var(--oled-ink); }
.monitor-lines { margin: 0; padding: 0; list-style: none; max-height: 220px; overflow-y: auto; font: 12px ui-monospace, monospace; white-space: pre; }

.learning [data-learn] { outline: 2px dashed var(--accent); outline-offset: 2px; cursor: crosshair; }
[data-learn].armed, button.armed { outline: 3px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 12: Run everything**

Run: `npm run typecheck && npm test && npm run e2e`
Expected: `tsc` prints nothing; all unit tests pass (141); all browser tests pass (19).

- [ ] **Step 13: Commit**

```bash
git add src/ui/settings.ts src/ui/panel.ts src/main.ts src/ui/style.css e2e/settings.spec.ts
git commit -m "Add settings drawer, MIDI learn mode and MIDI monitor"
```

---

### Task 17: README and the hardware checklist (§9)

**Files:**
- Modify: `README.md` (append a section)
- Create: `docs/hardware-check-m1.md`

**Interfaces:**
- Consumes: the finished milestone
- Produces: run/test/play instructions; the user's M32 checklist, whose "Record" section feeds back into `defaultSettings()`.

- [ ] **Step 1: Append the developer section to README.md**

Append to the end of `README.md`. Keep the existing transcript and image above it unchanged:

````markdown

---

## Nopia Web (this repository)

A browser harmony instrument inspired by the Nopia, played from a MIDI keyboard over Web MIDI.
Design: [docs/superpowers/specs/2026-10-01-nopia-web-design.md](docs/superpowers/specs/2026-10-01-nopia-web-design.md).

### Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173> in Chrome or Edge (in Windows, when developing in WSL2), allow MIDI
access when asked, and click to start audio.

### Test

```bash
npm test            # unit tests (Vitest)
npm run e2e         # browser tests (Playwright with a fake Web MIDI)
npm run typecheck
```

### Play

- Keys below the split point (default C4 = 60) play chords: each key is a scale degree, all 12 are
  harmonized. Keys from the split point up play the melody.
- Hold the key-select key (default G5 = 79, the M32's top key) and press a chord key to change the key.
- Left of the display: Real/Static layout, Major/Minor, Secondary dominants/Borrowed table, Extensions.
- Each module (Keys, Pad, Bass, Melody) can sound internally and/or go to a MIDI port and channel.
- Settings: split point, key-select note, master FX, control mappings with MIDI learn.
- Panic silences everything, internal and MIDI.

Hardware checklist: [docs/hardware-check-m1.md](docs/hardware-check-m1.md).
````

- [ ] **Step 2: Write the hardware checklist**

Create `docs/hardware-check-m1.md`:

```markdown
# Hardware check — Milestone 1

Run this with the Komplete Kontrol M32 connected to Windows. Note anything that differs from the
expected result; the "Record" section says which defaults to change.

## Setup

- [ ] In WSL: `npm install && npm run dev`.
- [ ] In Windows Chrome or Edge, open <http://localhost:5173>. Allow MIDI when asked. Click
      "Click to start audio".
- [ ] "MIDI in" shows the M32. If it is missing, close apps that hold the port (Komplete Kontrol
      standalone, a DAW using the M32), then reload. Without Windows MIDI Services, a Windows MIDI
      port can be open in only one app at a time.

Troubleshooting: if `localhost:5173` does not load, run `wsl --shutdown`, start WSL again and retry.
Do not use the WSL IP address instead: `http://<ip>` is not a secure context, so Web MIDI is
disabled.

## Discover the M32's plain-MIDI behaviour (MIDI monitor)

- [ ] Open **Monitor**. Press the lowest and the highest key. Expected: notes 48 and 79.
- [ ] Turn each of the 8 encoders. Expected: CC 14–21 on ch1. Note whether the values sweep
      0–127 (absolute) or hover around 1–10 / 118–127 (relative).
- [ ] Move the touch strip / mod strip: CC1. Move pitch bend: Pitch bend messages.
- [ ] Press the octave buttons and play the lowest key again. The chord stays the same (chord keys
      are identified by pitch class).

## Chords

- [ ] C major, Real, Secondary dominants: play the 12 lower keys. The OLED and the key labels match
      spec §3.2, column "Major (C)": C, A7, Dm, B7, Em, F, D7, G, E7, Am, C7, B°.
- [ ] Turn the Extensions encoder while holding Dm: the name goes Dm → Dm7 → Dm9 → Dm11. Notes the
      chords share keep sounding (no retrigger).
- [ ] Switch to Borrowed: C♯ plays D♭, D♯ plays E♭, G♯ plays A♭, A♯ plays B♭.
- [ ] Hold the top key (G5) and press A: the tonic becomes A. Switch to Minor: the OLED reads
      "A minor". The lower keys match spec §3.2, column "Minor (A)".
- [ ] Static mode, tonic D major: the C key plays D, the white keys play the diatonic chords.
- [ ] Hold C, then press F, release F: C comes back.

## Melody and expression

- [ ] The upper keys play the Lead. Pitch bend bends ±2 semitones. The mod strip adds vibrato.
- [ ] If a sustain pedal is connected: chords and melody notes hold until the pedal lifts.
- [ ] The volume encoders (CC 15–18) change Keys / Pad / Bass / Melody. CC 19 is Tone, 20 Reverb,
      21 Master.

## MIDI out (Bome Virtual MIDI Port → DAW)

- [ ] Keys → MIDI out "Bome…", channel 1. A DAW track listening to Bome ch1 receives the chords.
- [ ] Bass → Bome ch2, Melody → Bome ch5. Each DAW track receives only its own part.
- [ ] Turn "internal sound" off for Keys: only the DAW plays the chords.
- [ ] Select Bome as the MIDI input too: the feedback-loop warning appears. Switch the input back.

## No stuck notes

- [ ] Hold a chord and melody notes, click **Panic**: everything stops, internal and in the DAW.
- [ ] Hold a chord, switch to another browser tab: everything stops.
- [ ] Hold a chord, unplug the M32: everything stops and "Connect a keyboard" appears. Plug it back
      in: playing works again without a reload.
- [ ] With Keys on Bome, close the Bome port or the DAW: Keys shows ⚠ and plays internally.

## MIDI learn

- [ ] Click **Learn**, click the Extensions knob, turn an encoder: it is bound (Settings → Control
      mappings shows the CC). Turn it: Extensions follows. Click **Learn** again to leave learn mode.

## Record

- [ ] If the key range was not 48–79: set Split point and Key-select note in Settings ("press a
      key"). Then update `splitPoint` / `keySelectNote` in `defaultSettings()` in `src/core/store.ts`.
- [ ] If the encoders were not CC 14–21 on ch1: learn them. Then update the `bind(...)` calls in
      `defaultSettings()`.
- [ ] If the encoders were relative: set their mode to "relative" in the mapping list, and consider
      defaulting the bindings to `'relative'`.
- [ ] Note preset sounds that need tuning, with the knob values (`src/sound/presets.ts`).
```

- [ ] **Step 3: Final verification**

Run: `npm run typecheck && npm test && npm run e2e && npm run build`
Expected: `tsc` prints nothing; 141 unit tests pass; 19 browser tests pass; `vite build` prints `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/hardware-check-m1.md
git commit -m "Document running, testing and the milestone-1 hardware check"
```

- [ ] **Step 5: Hand over the hardware check**

Tell the user milestone 1 is ready for `docs/hardware-check-m1.md`. Changing defaults from what the user records there is a follow-up, not part of this task.

---

