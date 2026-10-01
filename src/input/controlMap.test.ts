import { beforeEach, describe, expect, it } from 'vitest';
import { Store } from '../core/store';
import { ControlMap, DETECT_SAMPLES, TICKS_PER_STEP } from './controlMap';

let store: Store;
let panics: number;
let map: ControlMap;

beforeEach(() => {
  store = new Store(null);
  panics = 0;
  map = new ControlMap(store, { panic: () => panics++ });
});

const binding = (target: string) => store.get().bindings.find((b) => b.target === target);

describe('MIDI learn', () => {
  it('binds the next CC (and its channel) to the armed target', () => {
    map.arm('reverb');
    expect(map.handleCC(3, 40, 64)).toBe(true);
    expect(binding('reverb')).toEqual({ target: 'reverb', channel: 3, cc: 40, mode: 'detect' });
    expect(map.armedTarget()).toBeNull();
    expect(store.get().master.reverb).toBe(0.25); // the learning message itself is not applied
  });

  it('replaces the target\'s old binding and any other binding on that CC', () => {
    map.arm('tone');
    map.handleCC(1, 14, 0); // CC14 was Extensions
    expect(binding('extensions')).toBeUndefined();
    expect(store.get().bindings.filter((b) => b.target === 'tone')).toHaveLength(1);
  });

  it('notifies when the armed target changes', () => {
    let calls = 0;
    map.onArmedChange(() => calls++);
    map.arm('delay');
    map.handleCC(1, 50, 1);
    expect(calls).toBe(2);
  });

  it('ignores unbound CCs', () => {
    expect(map.handleCC(1, 99, 64)).toBe(false);
  });
});

describe('encoder mode detection', () => {
  it('detects absolute from a value outside 1–10 / 118–127 and applies it', () => {
    map.handleCC(1, 15, 64); // vol.keys, default binding
    expect(binding('vol.keys')?.mode).toBe('absolute');
    expect(store.get().modules.keys.volume).toBeCloseTo(64 / 127);
  });

  it(`detects relative after ${DETECT_SAMPLES} values in the relative ranges`, () => {
    for (let i = 0; i < DETECT_SAMPLES; i++) map.handleCC(1, 15, i % 2 ? 1 : 127);
    expect(binding('vol.keys')?.mode).toBe('relative');
  });

  it('applies possible-relative values as relative while detecting', () => {
    const before = store.get().modules.keys.volume;
    map.handleCC(1, 15, 2); // +2
    expect(store.get().modules.keys.volume).toBeCloseTo(before + 2 / 127);
    expect(binding('vol.keys')?.mode).toBe('detect');
  });

  it('decodes two\'s complement and clamps to 0..1', () => {
    map.setMode('vol.keys', 'relative');
    map.handleCC(1, 15, 118); // −10
    expect(store.get().modules.keys.volume).toBeCloseTo(0.8 - 10 / 127);
    store.update((s) => (s.modules.keys.volume = 0.99));
    map.handleCC(1, 15, 10);
    expect(store.get().modules.keys.volume).toBe(1);
  });

  it('honours a manually set mode', () => {
    map.setMode('master', 'absolute');
    map.handleCC(1, 21, 5);
    expect(store.get().master.volume).toBeCloseTo(5 / 127);
  });
});

describe('targets', () => {
  it('quantizes Extensions to 4 steps in absolute mode', () => {
    map.setMode('extensions', 'absolute');
    const levels = [0, 31, 32, 63, 64, 95, 96, 127].map((v) => {
      map.handleCC(1, 14, v);
      return store.get().extLevel;
    });
    expect(levels).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it(`steps Extensions every ${TICKS_PER_STEP} relative ticks, clamped to 0..3`, () => {
    map.setMode('extensions', 'relative');
    for (let i = 0; i < TICKS_PER_STEP - 1; i++) map.handleCC(1, 14, 1);
    expect(store.get().extLevel).toBe(0);
    map.handleCC(1, 14, 1);
    expect(store.get().extLevel).toBe(1);
    for (let i = 0; i < 10; i++) map.handleCC(1, 14, 10);
    expect(store.get().extLevel).toBe(3);
    map.handleCC(1, 14, 127 - TICKS_PER_STEP + 1); // −TICKS_PER_STEP
    expect(store.get().extLevel).toBe(2);
  });

  it('flips toggles on values > 63 only', () => {
    map.arm('tonality');
    map.handleCC(1, 30, 127);
    map.handleCC(1, 30, 127);
    expect(store.get().tonality).toBe('minor');
    map.handleCC(1, 30, 0);
    expect(store.get().tonality).toBe('minor');
    map.handleCC(1, 30, 127);
    expect(store.get().tonality).toBe('major');
  });

  it('toggles layout and table', () => {
    map.arm('layout');
    map.handleCC(1, 31, 0);
    map.handleCC(1, 31, 127);
    map.arm('table');
    map.handleCC(1, 32, 0);
    map.handleCC(1, 32, 127);
    expect([store.get().layout, store.get().table]).toEqual(['static', 'borrowed']);
  });

  it('fires panic on press', () => {
    map.arm('panic');
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 127);
    map.handleCC(1, 33, 0);
    expect(panics).toBe(1);
  });

  it('unbinds a target', () => {
    map.unbind('reverb');
    expect(map.handleCC(1, 20, 64)).toBe(false);
  });
});
