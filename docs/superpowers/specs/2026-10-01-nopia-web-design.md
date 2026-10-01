# Nopia Web — Design Spec

Date: 2026-10-01
Status: approved (2026-10-02)

## 1. Purpose

A browser-based harmony instrument inspired by the Nopia mk1, played from a
Native Instruments Komplete Kontrol M32 over Web MIDI. It is for jamming and
exploring harmony, for songwriting (driving a DAW / external synths over MIDI),
and for learning (the display explains what is being played). It therefore
needs a built-in sound engine, per-module MIDI out, and an informative display
from the first milestone.

Each chord key plays a whole chord (a scale degree) rather than a single note.
All 12 notes are harmonized functionally, including those outside the scale.

### Constraints

- Runs in desktop Chrome/Edge (Web MIDI). Firefox may work; Safari is unsupported.
- Development happens in WSL2, where the M32 is not visible. The dev server runs
  in WSL; the user opens `http://localhost:5173` in Windows Chrome/Edge, where
  Web MIDI sees the M32 (localhost is a secure context).
- The M32's plain-MIDI behaviour (key range at default octave, encoder CC
  numbers, absolute vs relative encoders) is not known up front. It is verified
  in the milestone-1 hardware check using the built-in MIDI monitor; every
  default that depends on it is overridable from the UI.

### Success criteria

- Playing the M32's lower octave produces the chords in the tables of §3 in
  every key, in both layout modes, both tables, major and minor.
- The right-hand zone plays melody over the chords.
- Each module can sound internally and/or be sent to a MIDI port/channel, and a
  DAW receives it (e.g. via the Bome Virtual MIDI Port).
- No stuck notes: panic always silences everything, internal and MIDI.

## 2. Milestones

Each milestone ends playable on the real M32.

1. **Core** — chord engine, input routing, Keys, Pad, Bass, Melody modules,
   per-module MIDI out, master FX, panel UI, MIDI monitor, MIDI learn.
2. **Rhythm** — clock (tempo, tap tempo, metronome), Arp module, Strum module.
3. **Looper** — three clip slots (Verse/Chorus/Bridge) with record, play,
   overdub, clear.

Each milestone gets its own implementation plan.

## 3. Chord engine (`src/harmony/`)

Pure TypeScript, no browser APIs.

### 3.1 Data model

```ts
type PitchClass = number;            // 0..11, C = 0
type Tonality = 'major' | 'minor';
type LayoutMode = 'real' | 'static';
type TableId = 'secdom' | 'borrowed';
type ExtFamily = 'maj' | 'dom' | 'sec' | 'secb9' | 'min' | 'minPhr' | 'dim' | 'dim7';

interface ChordRow {
  rootOffset: number;   // semitones above tonic
  rootDegree: number;   // 1..7 scale-degree letter, used for spelling
  triad: 'maj' | 'min' | 'dim';
  family: ExtFamily;
  roman: string;        // e.g. 'ii', 'V7/ii', '♭VII'
}

interface Chord {
  root: PitchClass;
  intervals: number[];  // semitones above root, triad + extensions
  name: string;         // e.g. 'Dm9', 'A7♭9'
  roman: string;
  row: number;          // 0..11, the table row that produced it
}
```

Tables are data (`tables.ts`): `TABLES[tableId][tonality]` is 12 `ChordRow`s,
indexed by **row** = semitone offset of the pressed key from the tonic.

### 3.2 Secondary-dominant table (`secdom`, default)

Rule: an out-of-scale note becomes the leading tone (3rd) of a secondary
dominant resolving up a semitone to a diatonic root; if that target is
diminished, the note becomes the ♭7 of the dominant of IV (major) / VI (minor).
Bold = diatonic.

| Row | Major (C)           | family | Minor (A)            | family |
|-----|---------------------|--------|----------------------|--------|
| 0   | **C** I             | maj    | **Am** i             | min    |
| 1   | A7 V7/ii            | secb9  | C7 V7/VI             | sec    |
| 2   | **Dm** ii           | min    | **B°** ii°           | dim    |
| 3   | B7 V7/iii           | secb9  | **C** III            | maj    |
| 4   | **Em** iii          | minPhr | A7 V7/iv             | secb9  |
| 5   | **F** IV            | maj    | **Dm** iv            | min    |
| 6   | D7 V7/V             | sec    | B7 V7/V              | secb9  |
| 7   | **G** V             | dom    | **Em** v             | minPhr |
| 8   | E7 V7/vi            | secb9  | **F** VI             | maj    |
| 9   | **Am** vi           | min    | D7 V7/VII            | sec    |
| 10  | C7 V7/IV            | sec    | **G** VII            | dom    |
| 11  | **B°** vii°         | dim    | E7 V7                | secb9  |

`sec` targets a major chord (natural 9/13); `secb9` targets a minor chord
(♭9/♭13). With these choices every tension is diatonic to the key.

### 3.3 Borrowed table (`borrowed`)

Diatonic rows (white keys in static mode) are identical to §3.2. Only the five
chromatic rows change; here the pressed note is always the chord root.

| Row | Major (C)     | family | Minor (A)       | family |
|-----|---------------|--------|-----------------|--------|
| 1   | D♭ ♭II        | maj    | B♭ ♭II          | maj    |
| 3   | E♭ ♭III       | maj    | —               | —      |
| 4   | —             | —      | C♯m iii         | minPhr |
| 6   | F♯° ♯iv°      | dim    | D♯° ♯iv°        | dim7   |
| 8   | A♭ ♭VI        | maj    | —               | —      |
| 9   | —             | —      | F♯m vi          | min    |
| 10  | B♭ ♭VII       | dom    | —               | —      |
| 11  | —             | —      | G♯° vii°        | dim7   |

(— = the row is diatonic in that tonality; see §3.2.)

### 3.4 Key → row mapping

For a chord key with pitch class `p` and tonic `t`:

- **Real mode:** `row = (p − t) mod 12`.
- **Static mode, major:** `row = p` (the C key is always I).
- **Static mode, minor:** `row = (p − 9) mod 12` (the A key is always i).

In static mode the white keys are always the diatonic chords. The sounding
chord root is `(t + rootOffset) mod 12` in all modes.

### 3.5 Extensions

`level` 0..3 (the Extensions knob, continuous input quantized to 4 steps).
Intervals added on top of the triad, by family and level:

| family | 0          | 1        | 2              | 3                  |
|--------|------------|----------|----------------|--------------------|
| maj    | —          | 11       | 11,14          | 11,14,21           |
| dom    | —          | 10       | 10,14          | 10,14,21           |
| sec    | 10         | 10       | 10,14          | 10,14,21           |
| secb9  | 10         | 10       | 10,13          | 10,13,20           |
| min    | —          | 10       | 10,14          | 10,14,17           |
| minPhr | —          | 10       | 10,17          | 10,17              |
| dim    | —          | 10       | 10,17          | 10,17              |
| dim7   | —          | 9        | 9              | 9                  |

Secondary dominants always include their 7th. Name suffixes:

| family | 0  | 1    | 2       | 3        |
|--------|----|------|---------|----------|
| maj    | `` | maj7 | maj9    | maj13    |
| dom    | `` | 7    | 9       | 13       |
| sec    | 7  | 7    | 9       | 13       |
| secb9  | 7  | 7    | 7♭9     | 7♭9♭13   |
| min    | m  | m7   | m9      | m11      |
| minPhr | m  | m7   | m7(11)  | m7(11)   |
| dim    | °  | ø7   | ø7(11)  | ø7(11)   |
| dim7   | °  | °7   | °7      | °7       |

### 3.6 Spelling

Roots are spelled by scale-degree letter: letter = tonic letter + (rootDegree −
1), with the accidental chosen to hit the pitch. So C major's ♭III is E♭, not
D♯, and every key spells correctly. Double accidentals are allowed where the
letter rule needs them (e.g. F𝄪° for ♯iv° in C♯ minor). Tonic names offered by
the Tonal Selector:
major C D♭ D E♭ E F F♯ G A♭ A B♭ B; minor C C♯ D E♭ E F F♯ G G♯ A B♭ B.

### 3.7 Voicing (`voicing.ts`)

- **Keys:** pitch classes placed in close position (tensions folded into the
  octave). When a chord has more than 4 notes, the perfect 5th is dropped.
  First chord: lowest note in [52, 64). Next chords: among all inversions whose
  notes lie in [48, 79], choose the one minimizing Σ (distance from each new
  note to the nearest previous note); ties go to the lower register. Drift
  guard: if the voicing's mean leaves [55, 70], use the first-chord placement.
- **Pad:** the Keys voicing with its 2nd-lowest note raised an octave (open
  position), then shifted up an octave.
- **Bass:** the chord root in [36, 47].

### 3.8 Held keys and live changes

- Chord keys form a stack; the most recently pressed key sounds. Releasing the
  sounding key falls back to the most recent still-held key (retrigger);
  releasing the last key ends the chord.
- Chord velocity = the velocity of the pressing key.
- Changing tonic, tonality, layout mode, table or extension level while a chord
  sounds recomputes it: notes no longer present stop, new notes start, common
  notes sustain.

## 4. Input (`src/input/`)

### 4.1 MIDI access

`navigator.requestMIDIAccess()`; lists inputs and outputs, reacts to
`statechange` (hot-plug). Selected input/output names persist in localStorage
and are re-selected when present.

### 4.2 Input router

- **Split point** (default MIDI 60): notes below it are chord keys, identified
  by pitch class only (so the M32 octave buttons do not break the layout); notes
  at or above it are melody notes, passed through unchanged. Settable with a
  number field or "press a key to set".
- **Key-select note** (default MIDI 79, the top key if the M32 spans 48–79):
  reserved, never sounds. While it is held, pressing a chord key sets the tonic
  to that key's pitch class instead of playing a chord. Learnable.
- Both defaults are checked at the milestone-1 hardware check and adjusted if
  the M32's default range differs.
- **On-screen keyboard:** clicking chord/melody keys in the UI produces the same
  events as MIDI.

### 4.3 Controls and MIDI learn

Learnable targets: Extensions, Real/Static, Major/Minor, Table, the six module
volumes, Tone (low-pass cutoff on Keys/Pad/Arp), Reverb send, Delay send,
Master volume, Panic; in milestone 2 also Tempo and Arp rate; in milestone 3
the looper buttons.

- Learn: click a control's learn button, move a hardware control; its CC number
  (and channel) is bound.
- Encoder mode is auto-detected from the first values received: if all lie in
  1–10 or 118–127, the control is relative (two's complement); otherwise
  absolute. The mode can also be set manually in the mapping list.
- Toggle targets flip on a value > 63 (press).
- Default bindings assume M32 encoders send CC 14–21: 14 Extensions, 15 Keys
  vol, 16 Pad vol, 17 Bass vol, 18 Melody vol, 19 Tone, 20 Reverb, 21 Master.
  These are checked at the hardware check; learn overrides them.
- **Pitch bend** → Melody pitch (±2 semitones).
- **CC1 (mod strip)** → setting "Mod strip function": Vibrato (milestone 1
  default; Melody vibrato depth) or Strum (milestone 2, becomes the default).
- **CC64** → sustain for chord and melody notes.

## 5. Modules (`src/modules/`)

### 5.1 Interface

```ts
interface Module {
  id: 'keys' | 'pad' | 'bass' | 'melody' | 'arp' | 'strum';
  handle(event: BusEvent): void;   // chord on/off/change, melody note, clock tick, param
  allNotesOff(): void;
}
```

Modules translate bus events into note commands (`noteOn(note, vel, time)`,
`noteOff(note, time)`, `pitchBend`, `cc`) sent to a **sink**. Each module has:
enabled, volume, internal sound on/off + preset, MIDI out port (or none) +
channel. Two sinks exist: `ToneSink` (internal synth) and `MidiOutSink`. A
module sends to both when both are configured. Every sink tracks its sounding
notes so `allNotesOff()` is exact.

### 5.2 Modules

| Module | Plays | Presets (Tone.js) | MIDI ch | M |
|---|---|---|---|---|
| Keys | Keys voicing (§3.7) | E-piano (FM), Organ, Pluck | 1 | 1 |
| Bass | chord root, mono, last-chord priority | Sub, Saw bass | 2 | 1 |
| Arp | held chord tones in a pattern | Pluck, Bell | 3 | 2 |
| Pad | Pad voicing, slow attack/release | Warm saw pad, Glass | 4 | 1 |
| Melody | right-hand notes, pitch bend, vibrato | Lead (optional glide) | 5 | 1 |
| Strum | chord tones under the mod strip | Harp, Pluck | 6 | 2 |

MIDI out is off for every module until a port is chosen. Melody forwards pitch
bend and CC1 on its channel.

### 5.3 Master

Reverb send, delay send, Tone (low-pass on Keys/Pad/Arp), master volume, limiter.
Tone.js context uses `latencyHint: 'interactive'`; notes are triggered at
`Tone.now()` and MIDI is sent immediately.

### 5.4 Clock (milestone 2, `src/core/clock.ts`)

Tone.Transport, 4/4, 40–240 BPM (default 100), tap tempo (mean of the last 4
taps), optional metronome click. Emits grid ticks on the bus.

### 5.5 Arp (milestone 2)

Source: the Keys voicing, extended over `octaves` (1–3). Patterns: up, down,
up-down (ends not repeated), random. Rate: 1/4, 1/8, 1/8T, 1/16, 1/16T. Gate
10–100%. Steps fire on the transport grid. A chord change swaps the notes from
the next step; the pattern index resets when a chord starts from silence.
Silence when no chord is held.

### 5.6 Strum (milestone 2)

The chord's pitch classes are laid out upward over two octaves from the Keys
voicing's lowest note, plus the top root: N notes. CC1 0–127 is divided into N
equal zones. When the value moves into a new zone, every zone crossed triggers
its note. Notes use a plucked envelope; MIDI note-offs follow after 1.5 s. No
chord held → no strum notes.

### 5.7 Looper (milestone 3, `src/modules/looper.ts`)

- Records bus events, not audio: chord events as **table rows** (so loops
  follow later tonic/table/extension changes), melody notes as **offsets from
  the tonic** (so they transpose with the loop), strum input, and parameter
  changes.
- Three slots: Verse, Chorus, Bridge. Slot states: empty, recording, playing,
  overdubbing, stopped. One slot plays at a time.
- Record starts at the next bar; stopping rounds up to the end of the current
  bar; that sets the loop length in bars, and playback starts.
- Overdub merges new events into the slot. Clear empties it.
- Switching slots is queued to the end of the current loop.
- Replayed events go back onto the bus, so they drive internal sounds and MIDI
  out exactly like live playing. A live control move overrides a recorded
  parameter until that parameter's next recorded event.

## 6. Core (`src/core/`)

- `bus.ts` — typed, timestamped events: `chordOn`, `chordOff`, `chordChange`,
  `melodyOn`, `melodyOff`, `pitchBend`, `mod`, `sustain`, `param`, `tick`,
  `panic`.
- `store.ts` — typed settings with subscribe; persisted to localStorage under a
  versioned key; validated on load, falling back to defaults when invalid or
  from an older version. Persists: tonic, tonality, layout mode, table,
  extension level, split point, key-select note, control mappings, module
  settings, master settings, selected ports. Looper contents are not persisted.

Data flow:

```
Web MIDI in ─► InputRouter ─┬─ chord keys ─► ChordEngine ─┐
  (+ on-screen keys)        ├─ melody notes ──────────────┼─► Bus
                            └─ CC / learned ─► Store       │    ├─► Modules ─► ToneSink │ MidiOutSink
                               Clock (M2) ────────────────┘    ├─► Looper (M3): records / replays
                                                                └─► UI
```

## 7. UI (`src/ui/`)

Plain DOM + CSS, one panel styled after the Nopia: sage-green panel, white round
knobs, grey round buttons, OLED-style display.

- **Header:** MIDI input/output selectors, MIDI monitor toggle, learn toggle,
  looper slot buttons (M3), panic.
- **Left controls:** Real/Static, Major/Minor, Secondary-dominants/Borrowed,
  Extensions knob.
- **OLED:** current chord name, roman numeral, function (e.g. `V7/ii → Dm`),
  tonic + tonality + layout mode + table.
- **Tonal Selector:** 12 round buttons.
- **Keyboard view:** chord zone (each key labelled with the chord name and
  roman numeral it currently produces, updating live) and melody zone; keys light
  on press; clickable.
- **Module strip:** a volume knob per module; clicking a module opens its
  settings (enabled, sound on/off, preset, MIDI port + channel).
- **Settings drawer:** split point, key-select note, mod strip function,
  control mappings (with learn and mode), master FX.
- **MIDI monitor:** scrolling log of incoming messages (type, channel, data).
- **Start overlay:** "Click to start audio" until the AudioContext is running.
- Knobs respond to mouse drag and wheel.

## 8. Error handling

| Condition | Behaviour |
|---|---|
| No Web MIDI API | Banner: use Chrome or Edge. On-screen keyboard still works. |
| MIDI permission denied | Banner explaining how to re-allow MIDI for the site. |
| No input device / input unplugged | "Connect a keyboard" hint; all modules' notes off. |
| Output port disappears | Affected modules fall back to internal sound; warning badge on the module. |
| Same port selected as input and output | Warning about feedback loops. |
| AudioContext suspended | Start overlay. |
| Page hidden / panic button | `allNotesOff()` on every module; MIDI CC123 plus explicit note-offs for tracked notes. |
| Invalid stored settings | Defaults are used. |

## 9. Testing

- **Unit (Vitest, TDD):**
  - chord engine: every tonic × tonality × table × layout mode against §3.2–3.4;
    extensions and names (§3.5); spelling (§3.6); voicing range, drift guard and
    movement (§3.7); held-key stack and live changes (§3.8)
  - input router: split, pitch-class mapping, key-select note, sustain
  - MIDI learn: binding, relative/absolute detection
  - modules against a fake sink: note diffs on chord change, `allNotesOff`
  - store: persistence, validation, fallback
  - M2: arp patterns and grid, strum zones; M3: looper record, replay, overdub,
    slot switching, transposition
- **Browser (Playwright, run in WSL):** a fake `navigator.requestMIDIAccess` is
  injected; tests send M32-like messages and assert the OLED and key labels,
  and that a fake output receives the expected messages on the expected
  channels.
- **Hardware check (user, each milestone):** `npm run dev` in WSL, open
  `http://localhost:5173` in Windows Chrome/Edge with the M32 connected; a
  checklist covers chords, modes, encoders (using the MIDI monitor to confirm
  CCs and key range), melody, MIDI out into a DAW via the Bome port, and panic.

## 10. Stack and layout

TypeScript, Vite, Tone.js, Vitest, Playwright. No UI framework.

```
src/
  harmony/   theory.ts tables.ts chordEngine.ts extensions.ts spelling.ts voicing.ts
  input/     midiAccess.ts inputRouter.ts controlMap.ts
  core/      bus.ts store.ts clock.ts(M2)
  modules/   module.ts keys.ts pad.ts bass.ts melody.ts arp.ts(M2) strum.ts(M2) looper.ts(M3)
  sound/     presets.ts toneSink.ts midiOutSink.ts master.ts
  ui/        panel.ts knob.ts oled.ts keyboardView.ts tonalSelector.ts moduleStrip.ts settings.ts midiMonitor.ts
  main.ts
e2e/         Playwright tests + fake Web MIDI
```

## 11. Out of scope

MIDI clock in/out, sampled instruments, Nopia's 5-step FX chain, scales other
than major/natural minor, more than one chord sounding from the chord zone at
once, saving loops across reloads, mobile/touch layout.
