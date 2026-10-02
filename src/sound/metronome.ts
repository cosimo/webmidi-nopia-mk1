import * as Tone from 'tone';

/** The metronome click (spec §5.4), accented on the first beat of the bar. Internal sound only. */
export class Metronome {
  private synth: Tone.Synth;

  constructor(destination: Tone.InputNode) {
    this.synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 },
      volume: -12,
    });
    this.synth.connect(destination);
  }

  click(at: number, accent: boolean): void {
    this.synth.triggerAttackRelease(accent ? 1760 : 1320, 0.03, at, accent ? 1 : 0.6);
  }
}
