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
