import { describe, expect, it } from 'vitest';
import { chordSuffix, extensionIntervals } from './extensions';
import type { ExtFamily, ExtLevel } from './theory';

const FAMILIES: ExtFamily[] = ['maj', 'dom', 'sec', 'secb9', 'min', 'minPhr', 'dim', 'dim7'];
const LEVELS: ExtLevel[] = [0, 1, 2, 3];

describe('extensionIntervals', () => {
  it('adds nothing at level 0 except the 7th of secondary dominants', () => {
    expect(extensionIntervals('maj', 0)).toEqual([]);
    expect(extensionIntervals('min', 0)).toEqual([]);
    expect(extensionIntervals('sec', 0)).toEqual([10]);
    expect(extensionIntervals('secb9', 0)).toEqual([10]);
  });

  it('gives secb9 the ♭9 and ♭13, sec the natural 9 and 13', () => {
    expect(extensionIntervals('secb9', 3)).toEqual([10, 13, 20]);
    expect(extensionIntervals('sec', 3)).toEqual([10, 14, 21]);
  });

  it('gives the phrygian minor and half-diminished an 11th instead of a 9th', () => {
    expect(extensionIntervals('minPhr', 2)).toEqual([10, 17]);
    expect(extensionIntervals('dim', 3)).toEqual([10, 17]);
  });

  it('never adds tones at or below the triad, and never repeats one', () => {
    for (const f of FAMILIES) {
      for (const l of LEVELS) {
        const ivs = extensionIntervals(f, l);
        expect(new Set(ivs).size).toBe(ivs.length);
        for (const i of ivs) expect(i).toBeGreaterThan(7);
      }
    }
  });
});

describe('chordSuffix', () => {
  it('names extended chords', () => {
    expect(chordSuffix('maj', 2)).toBe('maj9');
    expect(chordSuffix('min', 3)).toBe('m11');
    expect(chordSuffix('secb9', 3)).toBe('7♭9♭13');
    expect(chordSuffix('dim', 1)).toBe('ø7');
    expect(chordSuffix('dim7', 1)).toBe('°7');
  });
});
