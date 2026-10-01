import { describe, expect, it } from 'vitest';
import { midiNoteName, pc } from './theory';

describe('pc', () => {
  it('wraps any integer into 0..11', () => {
    expect(pc(0)).toBe(0);
    expect(pc(13)).toBe(1);
    expect(pc(-1)).toBe(11);
    expect(pc(-13)).toBe(11);
  });
});

describe('midiNoteName', () => {
  it('names notes with octave, middle C = C4', () => {
    expect(midiNoteName(60)).toBe('C4');
    expect(midiNoteName(48)).toBe('C3');
    expect(midiNoteName(79)).toBe('G5');
    expect(midiNoteName(61)).toBe('C♯4');
  });
});
