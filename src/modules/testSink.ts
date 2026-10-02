import type { NoteSink } from './module';

const when = (at?: number) => (at === undefined ? '' : ` @${at}`);

/** Records sink calls as strings, for module tests. Timed notes end in ` @<time>`. */
export class FakeSink implements NoteSink {
  log: string[] = [];
  noteOn(note: number, velocity: number, at?: number) { this.log.push(`on ${note} ${velocity}${when(at)}`); }
  noteOff(note: number, at?: number) { this.log.push(`off ${note}${when(at)}`); }
  pitchBend(bend: number) { this.log.push(`bend ${bend}`); }
  cc(controller: number, value: number) { this.log.push(`cc ${controller} ${value}`); }
  allNotesOff() { this.log.push('allOff'); }
  take(): string[] {
    const l = this.log;
    this.log = [];
    return l;
  }
}
