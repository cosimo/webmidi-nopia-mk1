import { describe, expect, it } from 'vitest';
import { MidiOutSink } from './midiOutSink';

function fakePort() {
  const sent: number[][] = [];
  return { sent, send: (d: number[]) => void sent.push(d) };
}

describe('MidiOutSink', () => {
  it('sends note on/off on its channel', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 4);
    sink.noteOn(60, 100);
    sink.noteOff(60);
    expect(port.sent).toEqual([[0x93, 60, 100], [0x83, 60, 0]]);
  });

  it('only sends note-offs for notes it started', () => {
    const port = fakePort();
    new MidiOutSink(port, 1).noteOff(60);
    expect(port.sent).toEqual([]);
  });

  it('retriggers a note that is already sounding', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 1);
    sink.noteOn(60, 100);
    sink.noteOn(60, 90);
    expect(port.sent).toEqual([[0x90, 60, 100], [0x80, 60, 0], [0x90, 60, 90]]);
  });

  it('allNotesOff sends explicit note-offs then CC123', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 2);
    sink.noteOn(60, 100);
    sink.noteOn(64, 100);
    port.sent.length = 0;
    sink.allNotesOff();
    expect(port.sent).toEqual([[0x81, 60, 0], [0x81, 64, 0], [0xb1, 123, 0]]);
  });

  it('encodes pitch bend as 14 bits', () => {
    const port = fakePort();
    const sink = new MidiOutSink(port, 5);
    sink.pitchBend(0);
    sink.pitchBend(-1);
    sink.pitchBend(1);
    expect(port.sent).toEqual([[0xe4, 0, 64], [0xe4, 0, 0], [0xe4, 127, 127]]);
  });

  it('sends CCs', () => {
    const port = fakePort();
    new MidiOutSink(port, 5).cc(1, 99);
    expect(port.sent).toEqual([[0xb4, 1, 99]]);
  });

  it('stamps timed notes with the port time', () => {
    const sent: [number[], number | undefined][] = [];
    const sink = new MidiOutSink({ send: (d, t) => void sent.push([d, t]) }, 3, (at) => 1000 + at * 1000);
    sink.noteOn(60, 100, 2);
    sink.noteOff(60, 2.5);
    sink.noteOn(62, 100);
    expect(sent).toEqual([
      [[0x92, 60, 100], 3000],
      [[0x82, 60, 0], 3500],
      [[0x92, 62, 100], undefined],
    ]);
  });

  it('survives a port that throws', () => {
    const sink = new MidiOutSink({ send: () => { throw new Error('disconnected'); } }, 1);
    expect(() => {
      sink.noteOn(60, 100);
      sink.allNotesOff();
    }).not.toThrow();
  });
});
