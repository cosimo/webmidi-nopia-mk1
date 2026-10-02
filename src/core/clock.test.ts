import { describe, expect, it } from 'vitest';
import { clampTempo, PPQ, TapTempo, tickSeconds, TICKS_PER_BAR } from './clock';

describe('clock grid', () => {
  it('uses 12 ticks per quarter note, 48 per 4/4 bar', () => {
    expect([PPQ, TICKS_PER_BAR]).toEqual([12, 48]);
    expect(tickSeconds(120)).toBeCloseTo(0.5 / 12);
  });

  it('rounds and clamps tempos to 40–240 BPM', () => {
    expect([clampTempo(10), clampTempo(99.6), clampTempo(500), clampTempo(Infinity)]).toEqual([40, 100, 240, 240]);
  });
});

describe('TapTempo', () => {
  it('reports a tempo from the second tap, averaging over the last 4 taps', () => {
    const taps = new TapTempo();
    expect(taps.tap(0)).toBeNull();
    expect(taps.tap(500)).toBe(120);
    expect(taps.tap(1000)).toBe(120);
    expect(taps.tap(1800)).toBe(100); // (1800 − 0) / 3 = 600 ms
    expect(taps.tap(2400)).toBe(95); // only the last 4: (2400 − 500) / 3 ≈ 633 ms
  });

  it('starts a new count after a pause longer than 2 s', () => {
    const taps = new TapTempo();
    taps.tap(0);
    taps.tap(500);
    expect(taps.tap(3000)).toBeNull();
    expect(taps.tap(3400)).toBe(150);
  });

  it('clamps very fast or very slow tapping', () => {
    const fast = new TapTempo();
    fast.tap(0);
    expect(fast.tap(100)).toBe(240);
    const slow = new TapTempo();
    slow.tap(0);
    expect(slow.tap(1990)).toBe(40);
  });
});
