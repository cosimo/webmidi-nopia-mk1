import { describe, expect, it } from 'vitest';
import { NoteStarts } from './noteStarts';

describe('NoteStarts', () => {
  it('ends a note when asked, but never before it starts', () => {
    const notes = new NoteStarts(0.001);
    notes.start(60, 2);
    expect(notes.end(60, 1)).toBeCloseTo(2.001);
    notes.start(62, 2);
    expect(notes.end(62, 3)).toBe(3);
    notes.start(64, 2);
    expect(notes.end(64)).toBeCloseTo(2.001); // "now" for a note queued for later: just after it starts
    notes.start(65);
    expect(notes.end(65)).toBeUndefined(); // started now, ended now
    expect(notes.has(65)).toBe(false);
  });

  it('endAll ends and forgets every note', () => {
    const notes = new NoteStarts(1);
    notes.start(60);
    notes.start(64, 5000);
    expect(notes.endAll()).toEqual([[60, undefined], [64, 5001]]);
    expect(notes.has(60) || notes.has(64)).toBe(false);
  });
});
