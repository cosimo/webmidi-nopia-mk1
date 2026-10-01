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
