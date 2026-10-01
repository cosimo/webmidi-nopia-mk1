import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings, type ModuleId, type Settings } from '../core/store';
import { ModuleOutputs, type InternalSink, type SinkFactory } from './moduleOutputs';

let log: string[];
let ports: Map<string, { send(d: number[]): void }>;
let factory: SinkFactory;
let settings: Settings;
let outputs: ModuleOutputs;

function internalSink(id: ModuleId, preset: string): InternalSink {
  const tag = `${id}/${preset}`;
  return {
    noteOn: (n, v) => void log.push(`${tag} on ${n} ${v}`),
    noteOff: (n) => void log.push(`${tag} off ${n}`),
    pitchBend: () => {},
    cc: () => {},
    allNotesOff: () => void log.push(`${tag} allOff`),
    setVolume: (v) => void log.push(`${tag} vol ${v}`),
    dispose: () => void log.push(`${tag} dispose`),
  };
}

function addPort(name: string) {
  ports.set(name, { send: (d) => void log.push(`${name} ${d.join(',')}`) });
}

beforeEach(() => {
  log = [];
  ports = new Map();
  factory = { internal: internalSink, midiPort: (name) => ports.get(name) ?? null };
  settings = defaultSettings();
  outputs = new ModuleOutputs(factory);
});

describe('ModuleOutputs', () => {
  it('routes to the internal synth by default, at the module volume', () => {
    outputs.sync(settings);
    log = [];
    outputs.sink('keys').noteOn(60, 100);
    expect(log).toEqual(['keys/epiano on 60 100']);
  });

  it('sends to MIDI too when a port is chosen, with CC7 for the volume', () => {
    addPort('Bome');
    settings.modules.keys.port = 'Bome';
    outputs.sync(settings);
    expect(log).toContain('Bome 176,7,102'); // channel 1, CC7 = 0.8 * 127
    log = [];
    outputs.sink('keys').noteOn(60, 100);
    expect(log).toEqual(['keys/epiano on 60 100', 'Bome 144,60,100']);
  });

  it('sends MIDI only when internal sound is off', () => {
    addPort('Bome');
    settings.modules.bass.port = 'Bome';
    settings.modules.bass.sound = false;
    outputs.sync(settings);
    log = [];
    outputs.sink('bass').noteOn(36, 100);
    expect(log).toEqual(['Bome 145,36,100']); // channel 2
  });

  it('silences everything when a module is disabled', () => {
    outputs.sync(settings);
    outputs.sink('pad').noteOn(72, 100);
    settings.modules.pad.enabled = false;
    log = [];
    outputs.sync(settings);
    expect(log).toContain('pad/warmPad allOff');
    log = [];
    outputs.sink('pad').noteOn(72, 100);
    expect(log).toEqual([]);
  });

  it('stops and disposes the old synth when the preset changes', () => {
    outputs.sync(settings);
    settings.modules.keys.preset = 'organ';
    log = [];
    outputs.sync(settings);
    expect(log.filter((l) => l.startsWith('keys/'))).toEqual([
      'keys/organ vol 0.8', 'keys/epiano allOff', 'keys/epiano dispose',
    ]);
  });

  it('falls back to internal sound and flags the module when its port disappears', () => {
    addPort('Bome');
    settings.modules.melody.port = 'Bome';
    settings.modules.melody.sound = false;
    outputs.sync(settings);
    outputs.sink('melody').noteOn(72, 100);
    ports.delete('Bome');
    log = [];
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(true);
    expect(log).toContain('Bome 132,72,0'); // the old MIDI sink was told to stop (send may fail)
    log = [];
    outputs.sink('melody').noteOn(74, 100);
    expect(log).toEqual(['melody/lead on 74 100']);
  });

  it('reattaches when the port comes back', () => {
    settings.modules.melody.port = 'Bome';
    settings.modules.melody.sound = false;
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(true);
    addPort('Bome');
    outputs.sync(settings);
    expect(outputs.portMissing('melody')).toBe(false);
    log = [];
    outputs.sink('melody').noteOn(74, 100);
    expect(log).toEqual(['Bome 148,74,100']);
  });

  it('changes MIDI channel by replacing the sink (old notes stopped)', () => {
    addPort('Bome');
    settings.modules.keys.port = 'Bome';
    outputs.sync(settings);
    outputs.sink('keys').noteOn(60, 100);
    settings.modules.keys.channel = 3;
    log = [];
    outputs.sync(settings);
    expect(log).toEqual(expect.arrayContaining(['Bome 128,60,0', 'Bome 176,123,0', 'Bome 178,7,102']));
  });
});
