import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEventBody } from '../core/bus';
import { Store } from '../core/store';
import { InputRouter } from './inputRouter';

let calls: string[];
let events: BusEventBody[];
let consumeCC: boolean;
let store: Store;
let router: InputRouter;

beforeEach(() => {
  calls = [];
  events = [];
  consumeCC = false;
  store = new Store(null);
  router = new InputRouter({
    engine: {
      keyDown: (n, v) => calls.push(`down ${n} ${v}`),
      keyUp: (n) => calls.push(`up ${n}`),
      setSustain: (on) => calls.push(`sustain ${on}`),
    },
    bus: { emit: (e) => events.push(e) },
    store,
    controls: { handleCC: (ch, cc, v) => (calls.push(`cc ${ch} ${cc} ${v}`), consumeCC) },
  });
});

describe('InputRouter', () => {
  it('sends notes below the split point to the chord engine', () => {
    router.handleMidi([0x90, 48, 100]);
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual(['down 48 100', 'up 48']);
    expect(events).toEqual([]);
  });

  it('passes notes at or above the split point through as melody', () => {
    router.handleMidi([0x90, 60, 90]);
    router.handleMidi([0x90, 60, 0]); // note-on with velocity 0 = note-off
    expect(events).toEqual([
      { type: 'melodyOn', note: 60, velocity: 90 },
      { type: 'melodyOff', note: 60 },
    ]);
    expect(calls).toEqual([]);
  });

  it('accepts notes on any channel', () => {
    router.handleMidi([0x93, 48, 100]);
    expect(calls).toEqual(['down 48 100']);
  });

  it('routes a note-off to the zone its note-on went to, even if the split moved', () => {
    router.handleMidi([0x90, 55, 100]); // chord zone
    store.update((s) => (s.splitPoint = 50));
    router.handleMidi([0x80, 55, 0]);
    expect(calls).toEqual(['down 55 100', 'up 55']);
    expect(events).toEqual([]);
  });

  it('ignores note-offs for notes it never routed', () => {
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual([]);
  });

  it('never sounds the key-select note; while held, a chord key sets the tonic', () => {
    router.handleMidi([0x90, 79, 100]);
    router.handleMidi([0x90, 50, 100]); // D
    router.handleMidi([0x80, 50, 0]);
    router.handleMidi([0x80, 79, 0]);
    expect(store.get().tonic).toBe(2);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('plays chord keys normally once the key-select note is released', () => {
    router.handleMidi([0x90, 79, 100]);
    router.handleMidi([0x80, 79, 0]);
    router.handleMidi([0x90, 50, 100]);
    expect(calls).toEqual(['down 50 100']);
  });

  it('a repeated note-on for a held note releases it first (no stuck chord)', () => {
    router.handleMidi([0x90, 48, 100]);
    router.noteOn(48, 90); // e.g. the on-screen key clicked while the hardware key is held
    router.handleMidi([0x80, 48, 0]);
    expect(calls).toEqual(['down 48 100', 'up 48', 'down 48 90', 'up 48']);
  });

  it('keeps a key-select note below the split reserved', () => {
    store.update((s) => (s.keySelectNote = 59));
    router.handleMidi([0x90, 59, 100]);
    router.handleMidi([0x90, 52, 100]); // E
    expect(calls).toEqual([]);
    expect(store.get().tonic).toBe(4);
  });

  it('passes CCs to the control map first', () => {
    consumeCC = true;
    router.handleMidi([0xb2, 64, 127]);
    expect(calls).toEqual(['cc 3 64 127']);
    expect(events).toEqual([]);
  });

  it('turns unbound CC64 into sustain for chords and melody, on change only', () => {
    router.handleMidi([0xb0, 64, 127]);
    router.handleMidi([0xb0, 64, 100]);
    router.handleMidi([0xb0, 64, 0]);
    expect(calls.filter((c) => c.startsWith('sustain'))).toEqual(['sustain true', 'sustain false']);
    expect(events).toEqual([{ type: 'sustain', on: true }, { type: 'sustain', on: false }]);
  });

  it('turns unbound CC1 into mod events', () => {
    router.handleMidi([0xb0, 1, 77]);
    expect(events).toEqual([{ type: 'mod', value: 77 }]);
  });

  it('decodes pitch bend to −1..1', () => {
    router.handleMidi([0xe0, 0, 64]);
    router.handleMidi([0xe0, 0, 0]);
    router.handleMidi([0xe0, 127, 127]);
    expect(events.map((e) => (e as { bend: number }).bend)).toEqual([0, -1, 8191 / 8192]);
  });

  it('ignores system messages', () => {
    router.handleMidi([0xf8]);
    router.handleMidi([0xfe]);
    expect(calls).toEqual([]);
    expect(events).toEqual([]);
  });

  it('captures the next note-on instead of playing it', () => {
    let captured = -1;
    router.captureNextNote((n) => (captured = n));
    router.handleMidi([0x90, 72, 100]);
    router.handleMidi([0x80, 72, 0]);
    router.handleMidi([0x90, 72, 100]);
    expect(captured).toBe(72);
    expect(events).toEqual([{ type: 'melodyOn', note: 72, velocity: 100 }]);
  });

  it('reports key activity to listeners (for the keyboard view)', () => {
    const seen: string[] = [];
    router.onNote((n, on) => seen.push(`${n}${on ? '+' : '-'}`));
    router.noteOn(48, 100); // on-screen keyboard path
    router.noteOff(48);
    expect(seen).toEqual(['48+', '48-']);
    expect(calls).toEqual(['down 48 100', 'up 48']);
  });

  it('reset() forgets held notes so later note-offs do nothing', () => {
    router.handleMidi([0x90, 48, 100]);
    router.handleMidi([0x90, 60, 100]);
    router.reset();
    router.handleMidi([0x80, 48, 0]);
    router.handleMidi([0x80, 60, 0]);
    expect(calls).toEqual(['down 48 100']);
    expect(events).toEqual([{ type: 'melodyOn', note: 60, velocity: 100 }]);
  });
});
