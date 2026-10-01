import type { BusEvent } from '../core/bus';
import type { Module, NoteSink } from './module';

/** Right-hand notes, pitch bend and CC1 (vibrato), with sustain-pedal note-off deferral. */
export class MelodyModule implements Module {
  readonly id = 'melody' as const;
  private sustainOn = false;
  private sustained = new Set<number>(); // released while the pedal was down

  constructor(private out: NoteSink) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'melodyOn':
        this.sustained.delete(e.note);
        this.out.noteOn(e.note, e.velocity);
        break;
      case 'melodyOff':
        if (this.sustainOn) this.sustained.add(e.note);
        else this.out.noteOff(e.note);
        break;
      case 'sustain':
        this.sustainOn = e.on;
        if (!e.on) {
          for (const n of this.sustained) this.out.noteOff(n);
          this.sustained.clear();
        }
        break;
      case 'pitchBend':
        this.out.pitchBend(e.bend);
        break;
      case 'mod':
        this.out.cc(1, e.value);
        break;
      case 'panic':
        this.allNotesOff();
        break;
    }
  }

  allNotesOff(): void {
    this.out.allNotesOff();
    this.sustained.clear();
    this.sustainOn = false;
  }
}
