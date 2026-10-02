import { beforeEach, describe, expect, it } from 'vitest';
import type { BusEvent, BusEventBody } from '../core/bus';
import type { Param } from '../core/params';
import { chordForKey } from '../harmony/chordEngine';
import type { HarmonySettings } from '../harmony/theory';
import { Looper, type SlotId } from './looper';

const DUR = 0.125; // seconds per grid tick in these tests: a 48-tick bar lasts 6 s

let settings: HarmonySettings;
let out: BusEventBody[];
let applied: Param[];
let now: number;
let lastTick: number;
let looper: Looper;

const chord = (key: number) => chordForKey(key, settings);
const send = (body: BusEventBody) => looper.handle({ ...body, time: 0 } as BusEvent);
const slot = (id: SlotId) => looper.view().slots.find((s) => s.id === id)!;

/** Runs grid ticks up to and including `to`; the audio clock follows them. */
function runTo(to: number) {
  for (let k = lastTick + 1; k <= to; k++) {
    now = k * DUR;
    send({ type: 'tick', tick: k, at: k * DUR, dur: DUR });
  }
  lastTick = to;
}

/** Moves the audio clock to grid position `pos`, for the live event that follows. */
const at = (pos: number) => void (now = pos * DUR);

/** What the looper put on the bus since the last call; times are in grid ticks. */
function take(): string[] {
  const lines = out.map((e) => {
    const when = 'at' in e && e.at !== undefined ? ` @${e.at / DUR}` : '';
    switch (e.type) {
      case 'chordOn':
      case 'chordChange':
        return `${e.type} ${e.chord.name}${when}`;
      case 'melodyOn':
      case 'melodyOff':
        return `${e.type} ${e.note}${when}`;
      case 'mod':
        return `mod ${e.value}${when}`;
      default:
        return `${e.type}${when}`;
    }
  });
  out = [];
  return lines;
}

/** Records one bar from tick 48: `during` runs at tick 50; playback starts at tick 96. */
function recordBar(during: () => void) {
  runTo(1);
  looper.record();
  runTo(50);
  during();
  runTo(60);
  looper.record();
  runTo(95);
  out = [];
}

beforeEach(() => {
  settings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
  out = [];
  applied = [];
  now = 0;
  lastTick = -1;
  looper = new Looper({
    settings: () => settings,
    emit: (e) => void out.push(e),
    applyParam: (p) => {
      applied.push(p);
      send({ type: 'param', ...p }); // as in the app: the store change comes back as a param event
    },
    now: () => now,
  });
});

describe('Looper: recording and playback', () => {
  it('records from the next bar and loops whole bars of chords, as table rows', () => {
    runTo(3);
    looper.record();
    expect(slot('verse')).toEqual({ id: 'verse', state: 'recording', bars: 0, waiting: true });
    at(10);
    send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // before the bar, still held at it
    runTo(60);
    at(60.5);
    send({ type: 'chordChange', chord: chord(5), velocity: 80, retrigger: true }); // F
    runTo(70);
    at(70.5);
    send({ type: 'chordOff' });
    runTo(80);
    looper.record(); // stop: rounds up to the end of the bar
    expect(slot('verse').waiting).toBe(true);
    runTo(95);
    expect(take()).toEqual([]); // nothing replays while recording
    runTo(143);
    expect(take()).toEqual(['chordOn C @96', 'chordChange F @108.5', 'chordOff @118.5']);
    expect(slot('verse')).toEqual({ id: 'verse', state: 'playing', bars: 1, waiting: false });
  });

  it('replays chords under the current settings: tonic and extension changes carry over', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 });
      at(70);
      send({ type: 'chordOff' });
    });
    settings = { ...settings, tonic: 2, extLevel: 1 }; // D major, sevenths
    runTo(96);
    expect(take()).toEqual(['chordOn Dmaj7 @96']);
    settings = { ...settings, extLevel: 2 };
    looper.settingsChanged();
    expect(take()).toEqual(['chordChange Dmaj9']);
  });

  it('transposes melody notes with the tonic, to the nearest register', () => {
    recordBar(() => {
      at(53);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(60);
      send({ type: 'melodyOff', note: 72 });
    });
    settings = { ...settings, tonic: 11 }; // B: a semitone down is nearer than eleven up
    runTo(143);
    expect(take()).toEqual(['melodyOn 71 @101', 'melodyOff 71 @108']);
  });

  it('ends notes still held when recording stops at the loop end', () => {
    recordBar(() => {
      at(48);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
    });
    runTo(144);
    expect(take()).toEqual(['melodyOn 72 @96', 'melodyOff 72 @144', 'melodyOn 72 @144']);
  });

  it('records melody notes released under the sustain pedal until the pedal lifts', () => {
    recordBar(() => {
      at(50);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(51);
      send({ type: 'sustain', on: true });
      at(52);
      send({ type: 'melodyOff', note: 72 });
      at(56);
      send({ type: 'sustain', on: false });
    });
    runTo(143);
    expect(take()).toEqual(['melodyOn 72 @98', 'melodyOff 72 @104']);
  });

  it('ends a note shorter than a tick', () => {
    recordBar(() => {
      at(50.25);
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(50.75);
      send({ type: 'melodyOff', note: 72 });
    });
    runTo(143);
    expect(take()).toEqual(['melodyOn 72 @98.25', 'melodyOff 72 @98.75']);
  });

  it('a live chord overrides the loop\'s chord while held; the loop\'s chord comes back on release', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 }); // still held when playback starts
    });
    runTo(96);
    expect(take()).toEqual([]); // the live C is still held
    at(96.5);
    send({ type: 'chordOff' });
    expect(take()).toEqual(['chordOn C']);
    at(100);
    send({ type: 'chordOn', chord: chord(7), velocity: 90 }); // live G over the loop
    runTo(143);
    expect(take()).toEqual([]);
    at(143.5);
    send({ type: 'chordOff' });
    expect(take()).toEqual(['chordOn C']);
  });

  it('replays strum input and parameter moves, without recording its own replays', () => {
    recordBar(() => {
      at(50);
      send({ type: 'mod', value: 0 });
      at(51);
      send({ type: 'mod', value: 127 });
      at(52.5);
      send({ type: 'param', key: 'extLevel', value: 2 });
    });
    runTo(143);
    expect(take()).toEqual(['mod 0 @98', 'mod 127 @99']);
    expect(applied).toEqual([{ key: 'extLevel', value: 2 }]);
    looper.record(); // overdub through two more loops
    runTo(239);
    expect(applied).toHaveLength(3);
    expect(take().filter((l) => l.startsWith('mod'))).toHaveLength(4);
  });

  it('pressing Rec again before the bar cancels the recording', () => {
    runTo(1);
    looper.record();
    looper.record();
    runTo(100);
    expect(slot('verse').state).toBe('empty');
  });
});

describe('Looper: overdub, slots and control', () => {
  /** Verse: C held over the whole bar, playing from tick 96. */
  function verseOfC() {
    runTo(1);
    looper.record();
    runTo(48);
    at(48);
    send({ type: 'chordOn', chord: chord(0), velocity: 90 });
    runTo(60);
    looper.record();
    runTo(95);
    at(96);
    send({ type: 'chordOff' }); // released as the loop ends: C covers the whole bar
  }

  it('overdub merges: a newer chord wins while it lasts, then the older chord resumes', () => {
    verseOfC();
    runTo(100);
    expect(take()).toEqual(['chordOn C @96']);
    looper.record(); // overdub
    expect(slot('verse').state).toBe('overdubbing');
    runTo(110);
    at(110);
    send({ type: 'chordOn', chord: chord(5), velocity: 90 }); // F
    runTo(120);
    at(120);
    send({ type: 'chordOff' });
    looper.record(); // back to playing
    expect(take()).toEqual(['chordOn C']);
    runTo(191);
    expect(take()).toEqual(['chordChange F @158', 'chordChange C @168']);
  });

  it('an overdubbed chord held across the loop end continues without a retrigger', () => {
    runTo(1);
    looper.record();
    runTo(60);
    looper.record(); // an empty bar, playing from 96
    runTo(100);
    looper.record(); // overdub
    runTo(136);
    at(136);
    send({ type: 'chordOn', chord: chord(7), velocity: 90 }); // G from position 40 …
    runTo(154);
    at(154);
    send({ type: 'chordOff' }); // … to position 10 of the next pass
    looper.record();
    out = [];
    runTo(250);
    expect(take()).toEqual(['chordOn G @184', 'chordOff @202', 'chordOn G @232', 'chordOff @250']);
  });

  it('plays one slot at a time; switching waits for the end of the current loop', () => {
    verseOfC();
    runTo(100);
    looper.select('chorus');
    looper.record(); // the chorus records from bar 144; the verse stops there
    runTo(143);
    expect(slot('verse').state).toBe('playing');
    runTo(144);
    expect(slot('verse').state).toBe('stopped');
    at(144);
    send({ type: 'chordOn', chord: chord(5), velocity: 90 });
    runTo(150);
    looper.record();
    runTo(191);
    at(192);
    send({ type: 'chordOff' });
    runTo(192); // the chorus plays F from 192
    out = [];
    looper.select('verse'); // queued for the end of the chorus's loop
    expect(slot('verse').waiting).toBe(true);
    runTo(239);
    expect(take()).toEqual([]);
    runTo(240);
    expect(take()).toEqual(['chordOff @240', 'chordOn C @240']);
    expect([slot('verse').state, slot('chorus').state]).toEqual(['playing', 'stopped']);
  });

  it('stop silences the loop; play starts it again at the next bar', () => {
    recordBar(() => {
      at(48);
      send({ type: 'chordOn', chord: chord(0), velocity: 90 });
      send({ type: 'melodyOn', note: 72, velocity: 80 });
      at(70);
      send({ type: 'chordOff' });
      at(80);
      send({ type: 'melodyOff', note: 72 });
    });
    runTo(100);
    expect(take()).toEqual(['chordOn C @96', 'melodyOn 72 @96']);
    looper.play(); // stop
    expect(take()).toEqual(['chordOff', 'melodyOff 72']);
    expect(slot('verse').state).toBe('stopped');
    looper.play(); // from the next bar
    expect(slot('verse')).toEqual({ id: 'verse', state: 'playing', bars: 1, waiting: true });
    runTo(143);
    expect(take()).toEqual([]);
    runTo(144);
    expect(take()).toEqual(['chordOn C @144', 'melodyOn 72 @144']);
  });

  it('clear empties the selected slot and stops it', () => {
    verseOfC();
    runTo(100);
    out = [];
    looper.clear();
    expect(take()).toEqual(['chordOff']);
    expect(slot('verse')).toEqual({ id: 'verse', state: 'empty', bars: 0, waiting: false });
    runTo(200);
    expect(take()).toEqual([]);
  });

  it('panic stops playback and throws away an unfinished recording', () => {
    verseOfC();
    runTo(100);
    looper.select('chorus');
    looper.record(); // waiting for bar 144
    out = [];
    send({ type: 'panic' });
    expect(take()).toEqual([]); // the modules silence themselves on panic
    expect([slot('verse').state, slot('chorus').state]).toEqual(['stopped', 'empty']);
    runTo(200);
    expect(take()).toEqual([]);
  });

  it('reports slot states, lengths and the playing bar, and announces changes', () => {
    let changes = 0;
    looper.onChange(() => changes++);
    runTo(1);
    looper.record();
    runTo(100);
    looper.record(); // 52 ticks in: rounds up to two bars
    runTo(144);
    expect(looper.view()).toEqual({
      selected: 'verse',
      bar: 1,
      slots: [
        { id: 'verse', state: 'playing', bars: 2, waiting: false },
        { id: 'chorus', state: 'empty', bars: 0, waiting: false },
        { id: 'bridge', state: 'empty', bars: 0, waiting: false },
      ],
    });
    const before = changes;
    runTo(192);
    expect(looper.view().bar).toBe(2);
    expect(changes).toBeGreaterThan(before);
  });
});
