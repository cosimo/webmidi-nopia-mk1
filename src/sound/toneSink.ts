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
