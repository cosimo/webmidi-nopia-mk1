import { describe, expect, it } from 'vitest';
import { defaultSettings, isValidSettings, Store, STORAGE_KEY, type Settings } from './store';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('Store', () => {
  it('starts from defaults when nothing is stored', () => {
    expect(new Store(memoryStorage()).get()).toEqual(defaultSettings());
    expect(new Store(null).get()).toEqual(defaultSettings());
  });

  it('defaults to C major, real mode, split 60, key-select 79, CC 14–21 bindings', () => {
    const s = defaultSettings();
    expect([s.tonic, s.tonality, s.layout, s.table, s.extLevel]).toEqual([0, 'major', 'real', 'secdom', 0]);
    expect([s.splitPoint, s.keySelectNote]).toEqual([60, 79]);
    expect(s.bindings.map((b) => `${b.cc}:${b.target}`)).toEqual([
      '14:extensions', '15:vol.keys', '16:vol.pad', '17:vol.bass',
      '18:vol.melody', '19:tone', '20:reverb', '21:master',
    ]);
    expect(Object.values(s.modules).map((m) => m.channel)).toEqual([1, 4, 2, 5]);
    expect(Object.values(s.modules).every((m) => m.port === null)).toBe(true);
  });

  it('persists updates and reloads them', () => {
    const storage = memoryStorage();
    const a = new Store(storage);
    a.update((s) => {
      s.tonic = 7;
      s.modules.keys.port = 'Bome';
    });
    const b = new Store(storage);
    expect(b.get().tonic).toBe(7);
    expect(b.get().modules.keys.port).toBe('Bome');
  });

  it('notifies subscribers with next and prev, without mutating prev', () => {
    const store = new Store(memoryStorage());
    const seen: [Settings, Settings][] = [];
    const off = store.subscribe((n, p) => seen.push([n, p]));
    store.update((s) => (s.extLevel = 2));
    off();
    store.update((s) => (s.extLevel = 3));
    expect(seen).toHaveLength(1);
    expect(seen[0][0].extLevel).toBe(2);
    expect(seen[0][1].extLevel).toBe(0);
  });

  it('falls back to defaults on corrupt JSON', () => {
    const store = new Store(memoryStorage({ [STORAGE_KEY]: '{not json' }));
    expect(store.get()).toEqual(defaultSettings());
  });

  it('falls back to defaults when any field is invalid', () => {
    const bad = { ...defaultSettings(), tonic: 12 };
    expect(new Store(memoryStorage({ [STORAGE_KEY]: JSON.stringify(bad) })).get().tonic).toBe(0);
    const badPreset = defaultSettings();
    badPreset.modules.pad.preset = 'epiano'; // a Keys preset, not a Pad one
    expect(isValidSettings(badPreset)).toBe(false);
  });

  it('ignores settings stored by an older version under another key', () => {
    const store = new Store(memoryStorage({ 'nopia-web.settings.v0': JSON.stringify({ tonic: 5 }) }));
    expect(store.get().tonic).toBe(0);
  });

  it('keeps working when storage throws', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    const store = new Store(throwing);
    store.update((s) => (s.tonic = 3));
    expect(store.get().tonic).toBe(3);
  });

  it('validates the defaults', () => {
    expect(isValidSettings(defaultSettings())).toBe(true);
  });
});
