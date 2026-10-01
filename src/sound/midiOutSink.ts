import type { NoteSink } from '../modules/module';

export interface MidiOutputLike {
  send(data: number[]): void;
}

/** Sends a module's notes to one MIDI output port and channel, tracking sounding notes. */
export class MidiOutSink implements NoteSink {
  private sounding = new Set<number>();
  private ch: number;

  constructor(
    private port: MidiOutputLike,
    channel: number, // 1..16
  ) {
    this.ch = channel - 1;
  }

  noteOn(note: number, velocity: number): void {
    if (this.sounding.has(note)) this.send([0x80 | this.ch, note, 0]);
    this.send([0x90 | this.ch, note, Math.min(127, Math.max(1, Math.round(velocity)))]);
    this.sounding.add(note);
  }

  noteOff(note: number): void {
    if (!this.sounding.delete(note)) return;
    this.send([0x80 | this.ch, note, 0]);
  }

  pitchBend(bend: number): void {
    const v = Math.min(16383, Math.max(0, Math.round(bend * 8192) + 8192));
    this.send([0xe0 | this.ch, v & 0x7f, v >> 7]);
  }

  cc(controller: number, value: number): void {
    this.send([0xb0 | this.ch, controller, value]);
  }

  allNotesOff(): void {
    for (const note of this.sounding) this.send([0x80 | this.ch, note, 0]);
    this.sounding.clear();
    this.send([0xb0 | this.ch, 123, 0]);
  }

  private send(data: number[]): void {
    try {
      this.port.send(data);
    } catch {
      // port vanished mid-send; the next sync removes this sink
    }
  }
}
