import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import type { ModStripFunction } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import type { ExtLevel, HarmonySettings } from '../harmony/theory';
import { BassModule } from './bass';
import { KeysModule } from './keys';
import { MelodyModule } from './melody';
import type { Module } from './module';
import { PadModule } from './pad';
import { FakeSink } from './testSink';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number, extLevel: ExtLevel = 0) => chordForKey(key, { ...base, extLevel });
const send = (m: Module, body: BusEventBody) => m.handle({ ...body, time: 0 } as BusEvent);

let sink: FakeSink;
beforeEach(() => {
  sink = new FakeSink();
});

describe('KeysModule', () => {
  it('plays the Keys voicing at the chord velocity and stops it on chordOff', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(sink.take()).toEqual(['on 60 90', 'on 64 90', 'on 67 90']);
    send(keys, { type: 'chordOff' });
    expect(sink.take()).toEqual(['off 60', 'off 64', 'off 67']);
  });

  it('retriggers every note on a key change', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    sink.take();
    send(keys, { type: 'chordChange', chord: chord(5), velocity: 70, retrigger: true }); // F: 60 65 69
    expect(sink.take()).toEqual(['off 60', 'off 64', 'off 67', 'on 60 70', 'on 65 70', 'on 69 70']);
  });

  it('sustains common notes on a live (non-retrigger) change', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(2), velocity: 90 }); // Dm: 62 65 69
    sink.take();
    send(keys, { type: 'chordChange', chord: chord(2, 1), velocity: 90, retrigger: false }); // Dm7
    const log = sink.take();
    expect(log.filter((l) => l.startsWith('off'))).toEqual([]);
    expect(log).toEqual(['on 60 90']); // adds C below, keeps D F A
  });

  it('panic silences the sink and resets voice leading', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'chordOn', chord: chord(0), velocity: 90 });
    send(keys, { type: 'chordChange', chord: chord(5), velocity: 90, retrigger: true });
    sink.take();
    send(keys, { type: 'panic' });
    expect(sink.take()).toEqual(['allOff']);
    send(keys, { type: 'chordOn', chord: chord(5), velocity: 90 });
    expect(sink.take()).toEqual(['on 53 90', 'on 57 90', 'on 60 90']); // first-chord placement
  });

  it('ignores melody events', () => {
    const keys = new KeysModule(sink);
    send(keys, { type: 'melodyOn', note: 72, velocity: 90 });
    send(keys, { type: 'pitchBend', bend: 0.5 });
    expect(sink.take()).toEqual([]);
  });
});

describe('PadModule', () => {
  it('plays the open, raised Pad voicing', () => {
    const pad = new PadModule(sink);
    send(pad, { type: 'chordOn', chord: chord(0), velocity: 64 });
    expect(sink.take()).toEqual(['on 72 64', 'on 79 64', 'on 88 64']);
  });
});

describe('BassModule', () => {
  it('plays only the root, monophonically', () => {
    const bass = new BassModule(sink);
    send(bass, { type: 'chordOn', chord: chord(0), velocity: 100 });
    send(bass, { type: 'chordChange', chord: chord(1), velocity: 100, retrigger: true }); // A7
    expect(sink.take()).toEqual(['on 36 100', 'off 36', 'on 45 100']);
  });

  it('keeps the root sounding through a live extension change', () => {
    const bass = new BassModule(sink);
    send(bass, { type: 'chordOn', chord: chord(0), velocity: 100 });
    sink.take();
    send(bass, { type: 'chordChange', chord: chord(0, 3), velocity: 100, retrigger: false });
    expect(sink.take()).toEqual([]);
  });
});

describe('MelodyModule', () => {
  it('plays melody notes as they come', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    expect(sink.take()).toEqual(['on 72 80', 'off 72']);
  });

  it('forwards pitch bend and CC1', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'pitchBend', bend: -0.5 });
    send(mel, { type: 'mod', value: 99 });
    expect(sink.take()).toEqual(['bend -0.5', 'cc 1 99']);
  });

  it('defers note-offs while sustain is down', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    expect(sink.take()).toEqual(['on 72 80']);
    send(mel, { type: 'sustain', on: false });
    expect(sink.take()).toEqual(['off 72']);
  });

  it('does not release a re-struck note when the pedal lifts while it is held', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 72 });
    send(mel, { type: 'melodyOn', note: 72, velocity: 90 });
    send(mel, { type: 'sustain', on: false });
    expect(sink.take()).toEqual(['on 72 80', 'on 72 90']);
  });

  it('resets vibrato when the mod strip switches away from Vibrato, and then ignores CC1', () => {
    let fn: ModStripFunction = 'vibrato';
    const mel = new MelodyModule(sink, () => fn);
    send(mel, { type: 'mod', value: 90 });
    fn = 'strum';
    mel.modStripChanged();
    send(mel, { type: 'mod', value: 50 });
    expect(sink.take()).toEqual(['cc 1 90', 'cc 1 0']);
  });

  it('panic silences everything and forgets sustain', () => {
    const mel = new MelodyModule(sink, () => 'vibrato');
    send(mel, { type: 'sustain', on: true });
    send(mel, { type: 'melodyOn', note: 72, velocity: 80 });
    send(mel, { type: 'panic' });
    send(mel, { type: 'melodyOn', note: 74, velocity: 80 });
    send(mel, { type: 'melodyOff', note: 74 });
    expect(sink.take()).toEqual(['on 72 80', 'allOff', 'on 74 80', 'off 74']);
  });
});
