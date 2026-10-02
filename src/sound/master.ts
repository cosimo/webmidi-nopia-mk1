import * as Tone from 'tone';
import type { MasterSettings } from '../core/store';

/** Master section: Tone low-pass (Keys/Pad), reverb and delay sends, limiter, master volume. */
export class Master {
  /** For modules that bypass the Tone filter (Bass, Melody). */
  readonly input = new Tone.Gain(1);
  /** For Keys and Pad: through the Tone low-pass first. */
  readonly toneInput = new Tone.Filter(8000, 'lowpass');
  /** For the metronome: no Tone filter, no reverb or delay. */
  readonly clickInput = new Tone.Gain(1);
  private reverbSend = new Tone.Gain(0);
  private delaySend = new Tone.Gain(0);
  private out = new Tone.Gain(0);

  constructor() {
    const limiter = new Tone.Limiter(-1);
    limiter.chain(this.out, Tone.getDestination());
    this.toneInput.connect(this.input);
    this.input.connect(limiter);
    this.clickInput.connect(limiter);
    const reverb = new Tone.Reverb({ decay: 3.5, preDelay: 0.02, wet: 1 }).connect(limiter);
    const delay = new Tone.FeedbackDelay({ delayTime: 0.375, feedback: 0.35, wet: 1 }).connect(limiter);
    this.input.connect(this.reverbSend);
    this.reverbSend.connect(reverb);
    this.input.connect(this.delaySend);
    this.delaySend.connect(delay);
  }

  apply(m: MasterSettings): void {
    this.out.gain.rampTo(m.volume * m.volume, 0.05);
    this.reverbSend.gain.rampTo(m.reverb, 0.05);
    this.delaySend.gain.rampTo(m.delay, 0.05);
    this.toneInput.frequency.rampTo(200 * 90 ** m.tone, 0.05); // 200 Hz .. 18 kHz
  }
}
