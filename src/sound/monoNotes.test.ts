import { beforeEach, describe, expect, it } from 'vitest';
import { midiToFreq, MonoNotes } from './monoNotes';

let log: string[];
let mono: MonoNotes;
const f = (n: number) => midiToFreq(n).toFixed(1);

beforeEach(() => {
  log = [];
  mono = new MonoNotes({
    triggerAttack: (freq, _t, v) => log.push(`attack ${freq.toFixed(1)} ${v}`),
    triggerRelease: () => log.push('release'),
    setNote: (freq) => log.push(`set ${freq.toFixed(1)}`),
  });
});

describe('midiToFreq', () => {
  it('maps A4 to 440 Hz and an octave to a doubling', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBe(880);
  });
});

describe('MonoNotes', () => {
  it('attacks and releases a single note', () => {
    mono.attack(72, 0.8, 0);
    mono.release(72, 0);
    expect(log).toEqual([`attack ${f(72)} 0.8`, 'release']);
  });

  it('falls back to the previous held note when the sounding one is released', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.release(76, 0);
    mono.release(72, 0);
    expect(log).toEqual([`attack ${f(72)} 0.8`, `attack ${f(76)} 0.8`, `set ${f(72)}`, 'release']);
  });

  it('ignores the release of a note that is not sounding', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.release(72, 0);
    expect(log).toHaveLength(2);
  });

  it('releaseAll silences and forgets held notes', () => {
    mono.attack(72, 0.8, 0);
    mono.attack(76, 0.8, 0);
    mono.releaseAll(0);
    mono.release(76, 0);
    expect(log.at(-1)).toBe('release');
    expect(log).toHaveLength(3);
  });
});
