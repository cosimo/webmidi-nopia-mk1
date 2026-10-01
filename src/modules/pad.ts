import type { Chord } from '../harmony/theory';
import { padVoicing, Voicer } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class PadModule extends ChordModule {
  private voicer = new Voicer(); // follows the same chords as Keys, so it voices identically

  constructor(out: NoteSink) {
    super('pad', out);
  }

  protected voice(chord: Chord): number[] {
    return padVoicing(this.voicer.next(chord));
  }

  protected resetVoicing(): void {
    this.voicer.reset();
  }
}
