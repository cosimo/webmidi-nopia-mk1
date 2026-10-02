import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { STRUM_RELEASE_S, StrumModule, strumNotes } from './strum';
import { FakeSink } from './testSink';

const harmony: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number) => chordForKey(key, harmony);

let sink: FakeSink;
let active: boolean;
let timers: { seconds: number; fn: () => void }[];
let strum: StrumModule;

const send = (body: BusEventBody) => strum.handle({ ...body, time: 0 } as BusEvent);
const mod = (...values: number[]) => values.forEach((value) => send({ type: 'mod', value }));
/** Runs the oldest pending timer. */
const runTimer = () => timers.shift()!.fn();

beforeEach(() => {
  sink = new FakeSink();
  active = true;
  timers = [];
  strum = new StrumModule(sink, () => active, (seconds, fn) => void timers.push({ seconds, fn }));
});

describe('strumNotes', () => {
  it('lays the chord out over two octaves from the lowest Keys note, plus the top root', () => {
    expect(strumNotes(chord(0), 60)).toEqual([60, 64, 67, 72, 76, 79, 84]);
    expect(strumNotes(chord(0), 64)).toEqual([64, 67, 72, 76, 79, 84, 96]);
  });
});

describe('StrumModule', () => {
  it('plucks every zone the strip crosses, in order', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    expect(sink.take()).toEqual(['on 60 100']);
    mod(127);
    expect(sink.take()).toEqual(['on 64 100', 'on 67 100', 'on 72 100', 'on 76 100', 'on 79 100', 'on 84 100']);
    mod(60); // zone 3 of 7
    expect(sink.take()).toEqual(['on 79 100', 'on 76 100', 'on 72 100']);
    mod(62); // still zone 3
    expect(sink.take()).toEqual([]);
  });

  it('uses the Keys voicing of the current chord', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    send({ type: 'chordChange', chord: chord(5), velocity: 100, retrigger: true }); // F, voiced 60 65 69
    mod(127); // the first value plays only its own zone: F's top root
    expect(sink.take()).toEqual(['on 89 100']);
  });

  it('plays nothing without a chord, or while the mod strip is set to Vibrato', () => {
    mod(0, 127);
    active = false;
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0, 127);
    expect(sink.take()).toEqual([]);
  });

  it('ends each note 1.5 s after it was plucked, even when the chord is released', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    sink.take();
    expect(STRUM_RELEASE_S).toBe(1.5);
    expect(timers.map((t) => t.seconds)).toEqual([STRUM_RELEASE_S]);
    send({ type: 'chordOff' });
    expect(sink.take()).toEqual([]);
    runTimer();
    expect(sink.take()).toEqual(['off 60']);
  });

  it('re-striking a ringing note restarts its 1.5 s', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0, 20, 0); // 60, 64, then 60 again
    sink.take();
    runTimer(); // the first 60's timer: superseded by the re-strike
    expect(sink.take()).toEqual([]);
    runTimer(); // 64
    runTimer(); // the re-struck 60
    expect(sink.take()).toEqual(['off 64', 'off 60']);
  });

  it('panic silences it and cancels the pending note-offs', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 100 });
    mod(0);
    sink.take();
    send({ type: 'panic' });
    timers.splice(0).forEach((t) => t.fn());
    expect(sink.take()).toEqual(['allOff']);
    mod(127);
    expect(sink.take()).toEqual([]); // the chord is gone
  });
});
