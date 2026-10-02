import * as Tone from 'tone';
import { PPQ, tickSeconds } from '../core/clock';

/**
 * Tone's Transport as the grid clock (spec §5.4). `onTick` runs for every grid tick, a little
 * ahead of time: `at` is the AudioContext time the tick sounds, `dur` the seconds per tick.
 */
export function createTransport(onTick: (tick: number, at: number, dur: number) => void) {
  const transport = Tone.getTransport();
  let tick = 0;
  transport.scheduleRepeat((at) => onTick(tick++, at, tickSeconds(transport.bpm.value)), `${4 * PPQ}n`);
  return {
    setTempo(bpm: number) {
      transport.bpm.value = bpm;
    },
    /** Starts the grid once audio runs; it then runs for the whole session. */
    start() {
      if (transport.state !== 'started') transport.start();
    },
  };
}
