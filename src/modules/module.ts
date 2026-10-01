import type { BusEvent } from '../core/bus';
import type { ModuleId } from '../core/store';
import type { Chord } from '../harmony/theory';

/** Where a module's notes go: the internal synth, a MIDI port, or both (spec §5.1). */
export interface NoteSink {
  noteOn(note: number, velocity: number): void; // velocity 1..127
  noteOff(note: number): void;
  pitchBend(bend: number): void; // -1..1
  cc(controller: number, value: number): void;
  allNotesOff(): void;
}

export interface Module {
  readonly id: ModuleId;
  handle(event: BusEvent): void;
  allNotesOff(): void;
}

/** A module that plays one set of notes per chord: Keys, Pad, Bass. */
export abstract class ChordModule implements Module {
  private notes: number[] = [];

  constructor(
    readonly id: ModuleId,
    protected out: NoteSink,
  ) {}

  protected abstract voice(chord: Chord): number[];
  protected abstract resetVoicing(): void;

  handle(e: BusEvent): void {
    if (e.type === 'chordOn') this.play(this.voice(e.chord), e.velocity, true);
    else if (e.type === 'chordChange') this.play(this.voice(e.chord), e.velocity, e.retrigger);
    else if (e.type === 'chordOff') this.play([], 0, true);
    else if (e.type === 'panic') this.allNotesOff();
  }

  allNotesOff(): void {
    this.out.allNotesOff();
    this.notes = [];
    this.resetVoicing();
  }

  /** Retrigger restarts every note; otherwise common notes sustain. */
  private play(next: number[], velocity: number, retrigger: boolean): void {
    const stop = retrigger ? this.notes : this.notes.filter((n) => !next.includes(n));
    const start = retrigger ? next : next.filter((n) => !this.notes.includes(n));
    for (const n of stop) this.out.noteOff(n);
    for (const n of start) this.out.noteOn(n, velocity);
    this.notes = next;
  }
}
