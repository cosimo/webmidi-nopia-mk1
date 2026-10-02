import * as Tone from 'tone';
import type { InternalSink } from './moduleOutputs';
import { NoteStarts } from './noteStarts';
import type { Voice } from './presets';

const DISPOSE_AFTER_MS = 4000; // let release tails finish before disposing
const END_GAP = 0.001; // s: the earliest a note may end after it starts

/** A module's internal sound: Voice → (vibrato) → volume → destination. */
export class ToneSink implements InternalSink {
  private gain = new Tone.Gain(0);
  private vibrato: Tone.Vibrato | null = null;
  private notes = new NoteStarts(END_GAP);

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

  noteOn(note: number, velocity: number, at?: number): void {
    const t = at ?? Tone.immediate();
    if (this.notes.has(note)) this.voice.release(note, this.notes.end(note, t)!);
    this.voice.attack(note, velocity / 127, t);
    this.notes.start(note, t);
  }

  noteOff(note: number, at?: number): void {
    if (!this.notes.has(note)) return;
    this.voice.release(note, this.notes.end(note, at ?? Tone.immediate())!);
  }

  pitchBend(bend: number): void {
    this.voice.bend(bend * 2); // ±2 semitones
  }

  cc(controller: number, value: number): void {
    if (controller === 1 && this.vibrato) this.vibrato.depth.rampTo((value / 127) * 0.5, 0.05);
  }

  allNotesOff(): void {
    // a release before a queued attack would leave that note sounding: release after the last start
    const now = Tone.immediate();
    this.voice.releaseAll(Math.max(now, ...this.notes.endAll(now).map(([, t]) => t!)));
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
