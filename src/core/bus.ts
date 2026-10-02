import type { Chord } from '../harmony/theory';

/** Events the looper replays carry `at` (AudioContext time they sound) and `source: 'loop'`. */
type Replayable = { at?: number; source?: 'loop' };

export type BusEventBody =
  | ({ type: 'chordOn'; chord: Chord; velocity: number } & Replayable)
  | ({ type: 'chordChange'; chord: Chord; velocity: number; retrigger: boolean } & Replayable)
  | ({ type: 'chordOff' } & Replayable)
  | ({ type: 'melodyOn'; note: number; velocity: number } & Replayable)
  | ({ type: 'melodyOff'; note: number } & Replayable)
  | { type: 'pitchBend'; bend: number } // -1..1
  | ({ type: 'mod'; value: number } & Replayable) // CC1, 0..127
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
