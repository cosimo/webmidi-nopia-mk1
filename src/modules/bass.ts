import type { Chord } from '../harmony/theory';
import { bassNote } from '../harmony/voicing';
import { ChordModule, type NoteSink } from './module';

export class BassModule extends ChordModule {
  constructor(out: NoteSink) {
    super('bass', out);
  }

  protected voice(chord: Chord): number[] {
    return [bassNote(chord)];
  }

  protected resetVoicing(): void {}
}
