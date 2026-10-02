import type { Chord } from '../harmony/theory';

export type BusEventBody =
  | { type: 'chordOn'; chord: Chord; velocity: number }
  | { type: 'chordChange'; chord: Chord; velocity: number; retrigger: boolean }
  | { type: 'chordOff' }
  | { type: 'melodyOn'; note: number; velocity: number }
  | { type: 'melodyOff'; note: number }
  | { type: 'pitchBend'; bend: number } // -1..1
  | { type: 'mod'; value: number } // CC1, 0..127
  | { type: 'sustain'; on: boolean }
  | { type: 'tick'; tick: number; at: number; dur: number } // grid tick: index from the start, AudioContext time (s), seconds per tick
  | { type: 'panic' };

export type BusEvent = BusEventBody & { time: number }; // time: performance.now() ms

export type Listener = (event: BusEvent) => void;

export class Bus {
  private listeners: Listener[] = [];

  constructor(private now: () => number = () => performance.now()) {}

  emit(body: BusEventBody): void {
    const event = { ...body, time: this.now() } as BusEvent;
    for (const l of [...this.listeners]) l(event);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
