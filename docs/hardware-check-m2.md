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
