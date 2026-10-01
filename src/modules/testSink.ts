import type { NoteSink } from './module';

/** Records sink calls as strings, for module tests. */
export class FakeSink implements NoteSink {
  log: string[] = [];
  noteOn(note: number, velocity: number) { this.log.push(`on ${note} ${velocity}`); }
  noteOff(note: number) { this.log.push(`off ${note}`); }
  pitchBend(bend: number) { this.log.push(`bend ${bend}`); }
  cc(controller: number, value: number) { this.log.push(`cc ${controller} ${value}`); }
  allNotesOff() { this.log.push('allOff'); }
  take(): string[] {
    const l = this.log;
    this.log = [];
    return l;
  }
}
