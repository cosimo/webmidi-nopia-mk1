import type { ExtFamily, ExtLevel } from './theory';

/** Intervals added on top of the triad, by family and extension level (spec §3.5). */
export const EXTENSIONS: Record<ExtFamily, number[][]> = {
  maj: [[], [11], [11, 14], [11, 14, 21]],
  dom: [[], [10], [10, 14], [10, 14, 21]],
  sec: [[10], [10], [10, 14], [10, 14, 21]],
  secb9: [[10], [10], [10, 13], [10, 13, 20]],
  min: [[], [10], [10, 14], [10, 14, 17]],
  minPhr: [[], [10], [10, 17], [10, 17]],
  dim: [[], [10], [10, 17], [10, 17]],
  dim7: [[], [9], [9], [9]],
};

/** Chord-name suffixes, by family and extension level (spec §3.5). */
export const SUFFIXES: Record<ExtFamily, string[]> = {
  maj: ['', 'maj7', 'maj9', 'maj13'],
  dom: ['', '7', '9', '13'],
  sec: ['7', '7', '9', '13'],
  secb9: ['7', '7', '7♭9', '7♭9♭13'],
  min: ['m', 'm7', 'm9', 'm11'],
  minPhr: ['m', 'm7', 'm7(11)', 'm7(11)'],
  dim: ['°', 'ø7', 'ø7(11)', 'ø7(11)'],
  dim7: ['°', '°7', '°7', '°7'],
};

export function extensionIntervals(family: ExtFamily, level: ExtLevel): number[] {
  return EXTENSIONS[family][level];
}

export function chordSuffix(family: ExtFamily, level: ExtLevel): string {
  return SUFFIXES[family][level];
}
