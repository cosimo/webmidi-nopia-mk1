import * as Tone from 'tone';

/** An AudioContext time (s) as a Web MIDI timestamp (performance.now() ms); past times mean now. */
export function audioToPortTime(at: number): number {
  return performance.now() + Math.max(0, at - Tone.immediate()) * 1000;
}
