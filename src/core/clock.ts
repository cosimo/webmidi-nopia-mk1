/** Grid ticks per quarter note: 1/4 = 12, 1/8 = 6, 1/8T = 4, 1/16 = 3, 1/16T = 2. */
export const PPQ = 12;
/** 4/4 time. */
export const TICKS_PER_BAR = 4 * PPQ;
export const TEMPO_MIN = 40;
export const TEMPO_MAX = 240;
export const TEMPO_DEFAULT = 100;
/** Taps further apart than this start a new count. */
export const TAP_RESET_MS = 2000;

/** A whole number of BPM within 40–240. */
export function clampTempo(bpm: number): number {
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)));
}

/** Seconds per grid tick at `bpm`. */
export function tickSeconds(bpm: number): number {
  return 60 / bpm / PPQ;
}

/** Tap tempo (spec §5.4): the mean interval of the last 4 taps. */
export class TapTempo {
  private taps: number[] = [];

  /** Registers a tap at `nowMs`; returns the new tempo, or null until there are two taps. */
  tap(nowMs: number): number | null {
    const last = this.taps.at(-1);
    if (last !== undefined && nowMs - last > TAP_RESET_MS) this.taps = [];
    this.taps = [...this.taps, nowMs].slice(-4);
    if (this.taps.length < 2) return null;
    const mean = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return clampTempo(60000 / mean);
  }
}
