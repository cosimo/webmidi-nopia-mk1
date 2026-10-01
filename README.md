The "Nopia mk1" is a prototype synthesizer.

Here's the transcript of the creator intro video:

---
Combinations of notes sounding together generate emotions in us,
Harmony: a language we don't need to consciously know or think about to perceive, and enjoy music! Can we physically harness this mysterious phenomena?
Nopia was born out of this question.

Hey there, Martin here and I'm really pleased to show you what we've made. 
This is Nopia, a semi-modular harmony generator.

We showed the concept 3 years ago and has  since been developing it into reality.   
We kept the things we love and added what we always  dreamed of it having.

Let me show you around.
On this instrument, each key doesn't just play a single note.

Single notes are combined with their friends:
Chords, degrees. These are the basic  elements from which to start playing.
On Nopia, all 12 notes are functionally harmonized,
even the ones outside the scale.  

Our ears really don't have a problem  with these other notes.
In fact, we need them. They're super important.  Essential for harmonic movement.
Songs love them.

We can add color by using  the main extensions knob.
But how does all this work?  

If you know your way around the piano, you can set the chord builder to real mode.
You already know the scales.

Alternatively, static mode is a really cool  way to explore harmonic architecture.  
By keeping degrees in the same physical  spot, we start perceiving the feeling of movements.

See how my left hand  is always following the same path,
similar to why theory prioritizes harmonic  relationships. I feel our ears instinctively  
care more about these relationships  than the actual note pitches themselves.  

Static mode builds a sort of tonal muscle  memory, slowly inducing ourselves to swim  
in this relationship based language  to travel through this pitch space.
This information flows into the different modules.
The looper allows you to  record into three clip slots:
verse, chorus, bridge, if you will.

You can overdub all parameters or mix  them in real time like I'm doing here.
Nopia has an onboard audio engine,  a hybrid of sampled instruments and  
virtual analog synthesis organized into  expandable and customizable families.
We've also included extensive MIDI  connectivity. Each module can be  
individually routed to other synths.   

The sonic possibilities are endless...
And I've only just scratched the surface. Nopia  is full of surprises waiting for you to discover.

We invite you to be part of this dream.
See you on the other side.

---
An image of the nopia mk1 is [here](nopia-mk1.webp).

I have a midi keyboard at home. I'm wondering if it would be possible to make a web-midi application that implements similar functionality and driven by the midi keyboard.

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
