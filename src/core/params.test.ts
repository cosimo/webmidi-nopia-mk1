import { describe, expect, it } from 'vitest';
import { PARAM_KEYS, paramChanges, readParam, writeParam } from './params';
import { defaultSettings } from './store';

describe('recordable parameters', () => {
  it('are Extensions, the six module volumes and the master section, not the harmonic frame', () => {
    expect(PARAM_KEYS).toEqual([
      'extLevel', 'vol.keys', 'vol.pad', 'vol.bass', 'vol.melody', 'vol.arp', 'vol.strum',
      'tone', 'reverb', 'delay', 'master',
    ]);
  });

  it('reads and writes each one', () => {
    const s = defaultSettings();
    const value = (i: number) => (i === 0 ? 3 : i / 20);
    PARAM_KEYS.forEach((key, i) => writeParam(s, { key, value: value(i) }));
    expect(PARAM_KEYS.map((k) => readParam(s, k))).toEqual(PARAM_KEYS.map((_, i) => value(i)));
    expect([s.extLevel, s.modules.pad.volume, s.master.volume]).toEqual([3, 0.1, 0.5]);
  });

  it('lists the parameters that changed, ignoring everything else', () => {
    const prev = defaultSettings();
    const next = structuredClone(prev);
    next.tonic = 5;
    next.master.reverb = 0.5;
    next.modules.bass.volume = 0.1;
    expect(paramChanges(prev, next)).toEqual([
      { key: 'vol.bass', value: 0.1 },
      { key: 'reverb', value: 0.5 },
    ]);
  });
});
