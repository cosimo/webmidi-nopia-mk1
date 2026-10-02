import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import { defaultSettings, type ArpSettings } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { arpCycle, arpNotes, ArpModule } from './arp';
import { FakeSink } from './testSink';

const harmony: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const chord = (key: number) => chordForKey(key, harmony);
const DUR = 0.125; // seconds per grid tick in these tests

let sink: FakeSink;
let arp: ArpSettings;
let random: number;
let mod: ArpModule;

const send = (body: BusEventBody) => mod.handle({ ...body, time: 0 } as BusEvent);
const tick = (n: number, at = n * DUR, dur = DUR) => send({ type: 'tick', tick: n, at, dur });

/** Sends ticks from..to (inclusive) and returns what the sink received. */
function ticks(from: number, to: number): string[] {
  for (let n = from; n <= to; n++) tick(n);
  return sink.take();
}

beforeEach(() => {
  sink = new FakeSink();
  arp = { ...defaultSettings().arp }; // up, 1/8 = 6 ticks, 1 octave, gate 0.5
  random = 0;
  mod = new ArpModule(sink, () => arp, () => random);
});

describe('arp notes and patterns', () => {
  it('extends the voicing over octaves, low to high', () => {
    expect(arpNotes([60, 64, 67], 1)).toEqual([60, 64, 67]);
    expect(arpNotes([60, 64, 67], 2)).toEqual([60, 64, 67, 72, 76, 79]);
  });

  it('plays up, down, and up-down without repeating the ends', () => {
    expect(arpCycle([60, 64, 67, 72], 'up')).toEqual([60, 64, 67, 72]);
    expect(arpCycle([60, 64, 67, 72], 'down')).toEqual([72, 67, 64, 60]);
    expect(arpCycle([60, 64, 67, 72], 'upDown')).toEqual([60, 64, 67, 72, 67, 64]);
    expect(arpCycle([60, 64], 'upDown')).toEqual([60, 64]);
    expect(arpCycle([60], 'upDown')).toEqual([60]);
  });
});

describe('ArpModule', () => {
  it('plays one note per step on the grid, from the first grid step after the chord', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // C: 60 64 67
    expect(ticks(3, 5)).toEqual([]);
    expect(ticks(6, 6)).toEqual(['on 60 90 @0.75']);
    expect(ticks(7, 12)).toEqual(['off 60 @1.125', 'on 64 90 @1.5']);
    expect(ticks(13, 18)).toEqual(['off 64 @1.875', 'on 67 90 @2.25']);
    expect(ticks(19, 24)).toEqual(['off 67 @2.625', 'on 60 90 @3']);
  });

  it('follows the rate and the gate', () => {
    arp.rate = '1/16'; // 3 ticks
    arp.gate = 1;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 6)).toEqual(['on 60 90 @0', 'off 60 @0.375', 'on 64 90 @0.375', 'off 64 @0.75', 'on 67 90 @0.75']);
  });

  it('extends over octaves', () => {
    arp.octaves = 2;
    arp.pattern = 'down';
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 0)).toEqual(['on 79 90 @0']);
  });

  it('picks random notes with the given random source', () => {
    arp.pattern = 'random';
    random = 0.99;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 0)).toEqual(['on 67 90 @0']);
  });

  it('swaps in a new chord from the next step and continues the pattern', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 6); // C: 60 at tick 0, 64 at tick 6
    send({ type: 'chordChange', chord: chord(5), velocity: 80, retrigger: true }); // F, voiced 60 65 69
    expect(ticks(7, 12).filter((l) => l.startsWith('on'))).toEqual(['on 69 80 @1.5']);
  });

  it('restarts the pattern when a chord starts from silence', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 6); // 60, 64
    send({ type: 'chordOff' });
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(7, 12).filter((l) => l.startsWith('on'))).toEqual(['on 60 90 @1.5']);
  });

  it('is silent without a chord, letting the last note finish its gate', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 0); // on 60 @0, its note-off due at 0.375
    send({ type: 'chordOff' });
    expect(ticks(1, 24)).toEqual(['off 60 @0.375']);
  });

  it('panic ends a step scheduled ahead at its own start time', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(6, 6); // on 60 @0.75: the audio clock may not have reached it yet
    send({ type: 'panic' });
    expect(sink.take()).toEqual(['off 60 @0.751', 'allOff']);
    expect(ticks(7, 24)).toEqual([]);
  });

  it('at gate 100% a repeated note ends before it restarts', () => {
    arp.pattern = 'random';
    arp.gate = 1;
    random = 0; // always the lowest note
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    expect(ticks(0, 6)).toEqual(['on 60 90 @0', 'off 60 @0.75', 'on 60 90 @0.75']);
  });

  it('ends a ringing note before restarting it after a rate change', () => {
    arp.pattern = 'random'; // random = 0: always 60
    arp.rate = '1/4';
    arp.gate = 1;
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    ticks(0, 0); // on 60 @0, note-off due at 1.5
    arp.rate = '1/16';
    expect(ticks(1, 12)).toEqual([
      'off 60 @0.375', 'on 60 90 @0.375', // the 1/4 note is cut where the 1/16 one starts
      'off 60 @0.75', 'on 60 90 @0.75',
      'off 60 @1.125', 'on 60 90 @1.125',
      'off 60 @1.5', 'on 60 90 @1.5', // one note-off at 1.5: the 1/4 note's own was dropped
    ]);
  });

  it('keeps the gate a note started with when the tempo changes', () => {
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    tick(6); // on 60 @0.75, note-off due at 1.125
    sink.take();
    tick(7, 0.875, 0.25); // the tempo halves: ticks are now 0.25 s apart
    expect(sink.take()).toEqual([]);
    tick(8, 1.125, 0.25);
    expect(sink.take()).toEqual(['off 60 @1.125']);
  });
});
