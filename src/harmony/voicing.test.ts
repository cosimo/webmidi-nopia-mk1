import { describe, expect, it } from 'vitest';
import { chordForKey } from './chordEngine';
import type { Chord, ExtLevel, HarmonySettings } from './theory';
import { bassNote, padVoicing, Voicer } from './voicing';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number, extLevel: ExtLevel = 0): Chord => chordForKey(key, { ...base, extLevel });
const mean = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

describe('Voicer', () => {
  it('places the first chord in root position with the root in [52, 64)', () => {
    expect(new Voicer().next(chord(0))).toEqual([60, 64, 67]); // C
    expect(new Voicer().next(chord(4))).toEqual([52, 55, 59]); // Em
    expect(new Voicer().next(chord(11))).toEqual([59, 62, 65]); // B°
  });

  it('folds tensions into the octave and drops the 5th above 4 notes', () => {
    // Cmaj9 = C E G B D → C D E B (no G)
    expect(new Voicer().next(chord(0, 2))).toEqual([60, 62, 64, 71]);
    // A7 (4 notes) keeps its 5th
    expect(new Voicer().next(chord(1))).toEqual([57, 61, 64, 67]);
  });

  it('voice-leads to the nearest inversion', () => {
    const v = new Voicer();
    v.next(chord(0)); // C: 60 64 67
    expect(v.next(chord(5))).toEqual([60, 65, 69]); // F, second inversion
    expect(v.next(chord(7))).toEqual([59, 62, 67]); // G first inversion: B D G
  });

  it('breaks cost ties toward the lower register', () => {
    const v = new Voicer();
    v.next(chord(10)); // C7: 60 64 67 70
    // Em: [59 64 67] and [64 67 71] both cost 1 → the lower one wins
    expect(v.next(chord(4))).toEqual([59, 64, 67]);
  });

  it('keeps every voicing in [48, 79] and its mean in [55, 70]', () => {
    const v = new Voicer();
    for (let i = 0; i < 500; i++) {
      const notes = v.next(chord((i * 7 + (i % 5)) % 12, (i % 4) as ExtLevel));
      expect(Math.min(...notes)).toBeGreaterThanOrEqual(48);
      expect(Math.max(...notes)).toBeLessThanOrEqual(79);
      expect(mean(notes)).toBeGreaterThanOrEqual(55);
      expect(mean(notes)).toBeLessThanOrEqual(70);
    }
  });

  it('falls back to the first-chord placement when the mean drifts out of [55, 70]', () => {
    const v = new Voicer();
    expect(v.next(chord(4))).toEqual([52, 55, 59]); // Em
    // nearest Dm is [50 53 57], mean 53.3 < 55 → root position from [52, 64) instead
    expect(v.next(chord(2))).toEqual([62, 65, 69]);
  });

  it('reset() forgets the previous voicing', () => {
    const v = new Voicer();
    v.next(chord(0));
    v.next(chord(5));
    v.reset();
    expect(v.next(chord(5))).toEqual([53, 57, 60]);
  });
});

describe('padVoicing', () => {
  it('opens the voicing and lifts it an octave', () => {
    expect(padVoicing([60, 64, 67])).toEqual([72, 79, 88]);
    expect(padVoicing([57, 61, 64, 67])).toEqual([69, 76, 79, 85]);
  });
});

describe('bassNote', () => {
  it('puts the root in [36, 47]', () => {
    expect(bassNote(chord(0))).toBe(36);
    expect(bassNote(chord(11))).toBe(47);
    expect(bassNote(chord(1))).toBe(45); // A7 → A
  });
});
