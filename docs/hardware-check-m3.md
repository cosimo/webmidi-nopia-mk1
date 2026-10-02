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
