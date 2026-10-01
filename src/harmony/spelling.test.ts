import { describe, expect, it } from 'vitest';
import { spellRoot, TONIC_NAMES } from './spelling';

describe('TONIC_NAMES', () => {
  it('matches the Tonal Selector names in the spec', () => {
    expect(TONIC_NAMES.major.join(' ')).toBe('C D♭ D E♭ E F F♯ G A♭ A B♭ B');
    expect(TONIC_NAMES.minor.join(' ')).toBe('C C♯ D E♭ E F F♯ G G♯ A B♭ B');
  });
});

describe('spellRoot', () => {
  it('spells the tonic itself with its selector name', () => {
    for (const tonality of ['major', 'minor'] as const) {
      for (let t = 0; t < 12; t++) {
        expect(spellRoot(t, tonality, 1, t)).toBe(TONIC_NAMES[tonality][t]);
      }
    }
  });

  it('spells ♭III of C major as E♭, not D♯', () => {
    expect(spellRoot(0, 'major', 3, 3)).toBe('E♭');
  });

  it('spells V7/ii of C major as A', () => {
    expect(spellRoot(0, 'major', 6, 9)).toBe('A');
  });

  it('uses double sharps where the letter rule needs them', () => {
    // ♯iv° in C♯ minor: F𝄪
    expect(spellRoot(1, 'minor', 4, 7)).toBe('F𝄪');
  });

  it('uses double flats where the letter rule needs them', () => {
    // ♭VI in D♭ major: B𝄫
    expect(spellRoot(1, 'major', 6, 9)).toBe('B𝄫');
  });

  it('spells the major-key degrees of F♯ major', () => {
    const degrees = [0, 2, 4, 5, 7, 9, 11];
    const names = degrees.map((off, i) => spellRoot(6, 'major', i + 1, (6 + off) % 12));
    expect(names.join(' ')).toBe('F♯ G♯ A♯ B C♯ D♯ E♯');
  });
});
