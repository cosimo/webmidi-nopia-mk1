import { describe, expect, it } from 'vitest';
import { MidiPorts, pickInput, requestMidi } from './midiAccess';

interface FakePort {
  id: string;
  name: string;
  state: 'connected' | 'disconnected';
  onmidimessage?: ((e: { data: Uint8Array }) => void) | null;
  send?: (d: number[]) => void;
}

function fakeAccess(inputs: string[], outputs: string[]) {
  const port = (name: string): FakePort => ({ id: name, name, state: 'connected', onmidimessage: null });
  const access = {
    inputs: new Map(inputs.map((n) => [n, port(n)])),
    outputs: new Map(outputs.map((n) => [n, port(n)])),
    onstatechange: null as null | (() => void),
  };
  return { access, ports: new MidiPorts(access as unknown as MIDIAccess) };
}

describe('pickInput', () => {
  it('prefers the stored name when connected', () => {
    expect(pickInput(['A', 'M32'], 'M32')).toBe('M32');
  });

  it('picks nothing when the stored device is missing', () => {
    expect(pickInput(['A'], 'M32')).toBeNull();
  });

  it('otherwise picks the first input that is not a DAW port', () => {
    expect(pickInput(['KOMPLETE KONTROL M32 DAW', 'Komplete Kontrol M32'], null)).toBe('Komplete Kontrol M32');
    expect(pickInput(['X DAW'], null)).toBe('X DAW');
    expect(pickInput([], null)).toBeNull();
  });
});

describe('MidiPorts', () => {
  it('lists connected ports by name', () => {
    const { access, ports } = fakeAccess(['M32', 'Bome'], ['Bome', 'Synth']);
    access.outputs.get('Synth')!.state = 'disconnected';
    expect(ports.inputNames()).toEqual(['M32', 'Bome']);
    expect(ports.outputNames()).toEqual(['Bome']);
    expect(ports.output('Synth')).toBeNull();
    expect(ports.output('Bome')).not.toBeNull();
  });

  it('delivers messages from the selected input only', () => {
    const { access, ports } = fakeAccess(['M32', 'Other'], []);
    const got: number[][] = [];
    ports.onMessage((d) => got.push([...d]));
    expect(ports.useInput('M32')).toBe(true);
    access.inputs.get('M32')!.onmidimessage!({ data: new Uint8Array([0x90, 60, 100]) });
    expect(access.inputs.get('Other')!.onmidimessage).toBeNull();
    ports.useInput('Other');
    expect(access.inputs.get('M32')!.onmidimessage).toBeNull();
    expect(got).toEqual([[0x90, 60, 100]]);
    expect(ports.currentInput()).toBe('Other');
  });

  it('reports a disconnected input as not usable', () => {
    const { access, ports } = fakeAccess(['M32'], []);
    access.inputs.get('M32')!.state = 'disconnected';
    expect(ports.useInput('M32')).toBe(false);
    expect(ports.currentInput()).toBeNull();
  });

  it('notifies on hot-plug', () => {
    const { access, ports } = fakeAccess([], []);
    let changes = 0;
    ports.onChange(() => changes++);
    access.onstatechange!();
    expect(changes).toBe(1);
  });
});

describe('requestMidi', () => {
  it('reports a missing Web MIDI API', async () => {
    expect(await requestMidi({})).toEqual({ error: 'unsupported' });
  });

  it('reports a denied permission', async () => {
    const nav = { requestMIDIAccess: () => Promise.reject(new DOMException('no', 'SecurityError')) };
    expect(await requestMidi(nav)).toEqual({ error: 'denied' });
  });

  it('wraps the granted access', async () => {
    const { access } = fakeAccess(['M32'], []);
    const nav = { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) };
    const result = await requestMidi(nav);
    expect('ports' in result && result.ports.inputNames()).toEqual(['M32']);
  });
});
