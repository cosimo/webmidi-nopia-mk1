import type { Chord } from '../harmony/theory';
import { Voicer } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class KeysModule extends ChordModule {
  private voicer = new Voicer();

  constructor(out: NoteSink) {
    super('keys', out);
  }

  protected voice(chord: Chord): number[] {
    return this.voicer.next(chord);
  }

  protected resetVoicing(): void {
    this.voicer.reset();
  }
}
