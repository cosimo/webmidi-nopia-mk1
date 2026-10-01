import { pc, type Chord } from './theory';

const RANGE_LOW = 48;
const RANGE_HIGH = 79;
const FIRST_LOW = 52; // first-chord root lies in [52, 64)
const MEAN_LOW = 55;
const MEAN_HIGH = 70;

/** Chord tones relative to the root, folded into one octave, sorted; drops the 5th above 4 notes. */
function closeIntervals(chord: Chord): number[] {
  const ivs = chord.intervals.length > 4 ? chord.intervals.filter((i) => i !== 7) : chord.intervals;
  return [...new Set(ivs.map((i) => i % 12))].sort((a, b) => a - b);
}

/** Close-position voicing starting from chord tone `k`, with its lowest note at `low`. */
function stack(rel: number[], k: number, low: number): number[] {
  return rel.map((_, j) => low + pc(rel[(k + j) % rel.length] - rel[k]));
}

function mean(notes: number[]): number {
  return notes.reduce((a, b) => a + b, 0) / notes.length;
}

/** Root position, root in [52, 64). */
function firstPlacement(chord: Chord, rel: number[]): number[] {
  return stack(rel, 0, FIRST_LOW + pc(chord.root - FIRST_LOW));
}

function cost(notes: number[], prev: number[]): number {
  return notes.reduce((sum, n) => sum + Math.min(...prev.map((p) => Math.abs(n - p))), 0);
}

/** Keys voicing with voice leading (spec §3.7). One instance per module; reset() forgets history. */
export class Voicer {
  private prev: number[] | null = null;

  next(chord: Chord): number[] {
    const rel = closeIntervals(chord);
    let notes: number[];
    if (this.prev === null) {
      notes = firstPlacement(chord, rel);
    } else {
      let best: number[] | null = null;
      let bestCost = Infinity;
      for (let k = 0; k < rel.length; k++) {
        const lowPc = pc(chord.root + rel[k]);
        for (let low = RANGE_LOW + pc(lowPc - RANGE_LOW); low <= RANGE_HIGH; low += 12) {
          const cand = stack(rel, k, low);
          if (cand[cand.length - 1] > RANGE_HIGH) continue;
          const c = cost(cand, this.prev);
          if (c < bestCost || (c === bestCost && best !== null && cand[0] < best[0])) {
            best = cand;
            bestCost = c;
          }
        }
      }
      notes = best ?? firstPlacement(chord, rel);
      const m = mean(notes);
      if (m < MEAN_LOW || m > MEAN_HIGH) notes = firstPlacement(chord, rel);
    }
    this.prev = notes;
    return notes;
  }

  reset(): void {
    this.prev = null;
  }
}

/** Pad: the Keys voicing with its 2nd-lowest note raised an octave, then all up an octave. */
export function padVoicing(keys: number[]): number[] {
  const sorted = [...keys].sort((a, b) => a - b);
  if (sorted.length > 1) sorted[1] += 12;
  return sorted.map((n) => n + 12).sort((a, b) => a - b);
}

/** Bass: the chord root in [36, 47]. */
export function bassNote(chord: Chord): number {
  return 36 + chord.root;
}
