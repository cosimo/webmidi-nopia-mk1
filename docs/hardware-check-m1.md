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

- [ ] The upper keys play the Lead. Pitch bend bends ±2 semitones. With Settings → Mod strip set
      to Vibrato (milestone 2 defaults it to Strum), the mod strip adds vibrato.
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
