type MessageListener = (data: Uint8Array) => void;

const connected = (p: MIDIPort) => p.state === 'connected';
const portName = (p: MIDIPort) => p.name ?? p.id;

/**
 * Which input to listen to: the stored name when it is connected; nothing when a stored
 * device is missing; otherwise the first input whose name does not mention "DAW".
 */
export function pickInput(names: string[], stored: string | null): string | null {
  if (stored !== null) return names.includes(stored) ? stored : null;
  return names.find((n) => !/daw/i.test(n)) ?? names[0] ?? null;
}

/** Wraps MIDIAccess: port lists, the selected input's messages, hot-plug notifications. */
export class MidiPorts {
  private input: MIDIInput | null = null;
  private messageListeners: MessageListener[] = [];
  private changeListeners: (() => void)[] = [];

  constructor(private access: MIDIAccess) {
    access.onstatechange = () => {
      for (const l of this.changeListeners) l();
    };
  }

  inputNames(): string[] {
    return [...this.access.inputs.values()].filter(connected).map(portName);
  }

  outputNames(): string[] {
    return [...this.access.outputs.values()].filter(connected).map(portName);
  }

  output(name: string): MIDIOutput | null {
    return [...this.access.outputs.values()].find((p) => connected(p) && portName(p) === name) ?? null;
  }

  /** Listen to the named input (null = none). Returns false if it is not connected. */
  useInput(name: string | null): boolean {
    const next =
      name === null ? null : ([...this.access.inputs.values()].find((p) => connected(p) && portName(p) === name) ?? null);
    if (next !== this.input) {
      if (this.input) this.input.onmidimessage = null;
      this.input = next;
      if (next) {
        next.onmidimessage = (e) => {
          if (e.data) for (const l of this.messageListeners) l(e.data);
        };
      }
    }
    return next !== null;
  }

  currentInput(): string | null {
    return this.input ? portName(this.input) : null;
  }

  onMessage(listener: MessageListener): void {
    this.messageListeners.push(listener);
  }

  /** Called when any port is connected or disconnected. */
  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }
}

export type MidiResult = { ports: MidiPorts } | { error: 'unsupported' | 'denied' };

export async function requestMidi(nav: { requestMIDIAccess?: Navigator['requestMIDIAccess'] }): Promise<MidiResult> {
  if (typeof nav.requestMIDIAccess !== 'function') return { error: 'unsupported' };
  try {
    return { ports: new MidiPorts(await nav.requestMIDIAccess({ sysex: false })) };
  } catch {
    return { error: 'denied' };
  }
}
