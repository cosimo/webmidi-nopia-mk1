import { beforeEach, describe, expect, it } from 'vitest';
import { ChordEngine } from './chordEngine';
import type { HarmonySettings } from './theory';

type Ev = { type: string; chord?: { name: string }; velocity?: number; retrigger?: boolean };

let settings: HarmonySettings;
let events: Ev[];
let engine: ChordEngine;
const summary = () =>
  events.map((e) =>
    e.type === 'chordOff' ? 'off' : `${e.type === 'chordOn' ? 'on' : e.retrigger ? 'change!' : 'change'} ${e.chord!.name}`,
  );

beforeEach(() => {
  settings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
  events = [];
  engine = new ChordEngine(() => settings, (e) => events.push(e as Ev));
});

describe('ChordEngine held keys (§3.8)', () => {
  it('starts and ends a chord', () => {
    engine.keyDown(48, 90);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'off']);
    expect(events[0].velocity).toBe(90);
  });

  it('identifies chord keys by pitch class', () => {
    engine.keyDown(50, 90); // D in any octave → Dm
    expect(summary()).toEqual(['on Dm']);
    expect(engine.current()?.name).toBe('Dm');
  });

  it('plays the most recent key and falls back on release (retrigger)', () => {
    engine.keyDown(48, 80); // C
    engine.keyDown(53, 70); // F
    engine.keyUp(53);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'change! F', 'change! C', 'off']);
    expect(events[2].velocity).toBe(80);
  });

  it('ignores the release of a key that is not sounding', () => {
    engine.keyDown(48, 80);
    engine.keyDown(53, 70);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C', 'change! F']);
  });

  it('does not retrigger when the fallback key has the same pitch class', () => {
    engine.keyDown(48, 80);
    engine.keyDown(60, 70);
    engine.keyUp(60);
    expect(summary()).toEqual(['on C', 'change! C']);
  });

  it('recomputes on settings changes without retriggering', () => {
    engine.keyDown(50, 80); // Dm
    settings = { ...settings, extLevel: 2 };
    engine.settingsChanged();
    expect(summary()).toEqual(['on Dm', 'change Dm9']);
  });

  it('emits nothing on a settings change that leaves the chord unchanged, or when silent', () => {
    engine.settingsChanged();
    engine.keyDown(48, 80);
    settings = { ...settings, layout: 'static' }; // C major: static = real
    engine.settingsChanged();
    expect(summary()).toEqual(['on C']);
  });

  it('sets the tonic live: the held key re-resolves', () => {
    engine.keyDown(50, 80); // D in C major → Dm
    settings = { ...settings, tonic: 2 }; // D major → D
    engine.settingsChanged();
    expect(summary()).toEqual(['on Dm', 'change D']);
  });
});

describe('ChordEngine sustain', () => {
  it('holds the chord after release until the pedal lifts', () => {
    engine.setSustain(true);
    engine.keyDown(48, 80);
    engine.keyUp(48);
    expect(summary()).toEqual(['on C']);
    engine.setSustain(false);
    expect(summary()).toEqual(['on C', 'off']);
  });

  it('changes chord on a new press under sustain, and ends it on pedal up', () => {
    engine.setSustain(true);
    engine.keyDown(48, 80);
    engine.keyUp(48);
    engine.keyDown(53, 80);
    engine.keyUp(53);
    engine.setSustain(false);
    expect(summary()).toEqual(['on C', 'change! F', 'off']);
  });

  it('falls back to a still-held key when the pedal lifts', () => {
    engine.keyDown(55, 80); // G held
    engine.setSustain(true);
    engine.keyDown(48, 80); // C
    engine.keyUp(48);
    engine.setSustain(false);
    expect(summary()).toEqual(['on G', 'change! C', 'change! G']);
  });

  it('recomputes a sustained chord on settings changes and still ends it on pedal up', () => {
    engine.setSustain(true);
    engine.keyDown(50, 80); // Dm
    engine.keyUp(50);
    settings = { ...settings, extLevel: 2 };
    engine.settingsChanged();
    engine.setSustain(false);
    expect(summary()).toEqual(['on Dm', 'change Dm9', 'off']);
  });

  it('reset() forgets everything silently', () => {
    engine.keyDown(48, 80);
    engine.reset();
    engine.keyUp(48);
    expect(summary()).toEqual(['on C']);
    expect(engine.current()).toBeNull();
  });
});
