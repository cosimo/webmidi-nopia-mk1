import { MODULE_IDS, type ModuleId, type Settings } from '../core/store';
import type { NoteSink } from '../modules/module';
import { MidiOutSink, type MidiOutputLike } from './midiOutSink';

export interface InternalSink extends NoteSink {
  setVolume(volume: number): void; // 0..1
  dispose(): void;
}

export interface SinkFactory {
  internal(id: ModuleId, preset: string): InternalSink;
  /** The connected output with this name, or null when it is not present. */
  midiPort(name: string): MidiOutputLike | null;
  /** An AudioContext time (s) as a MIDI port timestamp (ms). */
  portTime(at: number): number;
}

/** Fans a module's notes out to its current sinks; sinks that are removed get allNotesOff(). */
export class FanoutSink implements NoteSink {
  private sinks: NoteSink[] = [];

  setSinks(next: NoteSink[]): void {
    for (const s of this.sinks) if (!next.includes(s)) s.allNotesOff();
    this.sinks = next;
  }

  noteOn(note: number, velocity: number, at?: number): void {
    for (const s of this.sinks) s.noteOn(note, velocity, at);
  }
  noteOff(note: number, at?: number): void {
    for (const s of this.sinks) s.noteOff(note, at);
  }
  pitchBend(bend: number): void {
    for (const s of this.sinks) s.pitchBend(bend);
  }
  cc(controller: number, value: number): void {
    for (const s of this.sinks) s.cc(controller, value);
  }
  allNotesOff(): void {
    for (const s of this.sinks) s.allNotesOff();
  }
}

interface Route {
  fanout: FanoutSink;
  internal: { preset: string; sink: InternalSink } | null;
  midi: { key: string; sink: MidiOutSink; volume: number } | null;
  portMissing: boolean;
}

/** Applies module settings (enabled, sound, preset, port, channel, volume) to each module's sinks. */
export class ModuleOutputs {
  private routes = {} as Record<ModuleId, Route>;

  constructor(private factory: SinkFactory) {
    for (const id of MODULE_IDS) {
      this.routes[id] = { fanout: new FanoutSink(), internal: null, midi: null, portMissing: false };
    }
  }

  sink(id: ModuleId): NoteSink {
    return this.routes[id].fanout;
  }

  /** True when the module's chosen MIDI port is not connected (it falls back to internal sound). */
  portMissing(id: ModuleId): boolean {
    return this.routes[id].portMissing;
  }

  sync(settings: Settings): void {
    for (const id of MODULE_IDS) this.syncModule(id, settings);
  }

  private syncModule(id: ModuleId, settings: Settings): void {
    const m = settings.modules[id];
    const route = this.routes[id];
    const port = m.port === null ? null : this.factory.midiPort(m.port);
    route.portMissing = m.port !== null && port === null;

    const oldInternal = route.internal;
    if (m.sound || route.portMissing) {
      if (!route.internal || route.internal.preset !== m.preset) {
        route.internal = { preset: m.preset, sink: this.factory.internal(id, m.preset) };
      }
      route.internal.sink.setVolume(m.volume);
    } else {
      route.internal = null;
    }

    const midiKey = port ? `${m.port}#${m.channel}` : null;
    if (route.midi?.key !== midiKey) {
      route.midi = port && midiKey
        ? { key: midiKey, sink: new MidiOutSink(port, m.channel, (at) => this.factory.portTime(at)), volume: -1 }
        : null;
    }
    if (route.midi && route.midi.volume !== m.volume) {
      route.midi.volume = m.volume;
      route.midi.sink.cc(7, Math.round(m.volume * 127));
    }

    const sinks: NoteSink[] = [];
    if (m.enabled && route.internal) sinks.push(route.internal.sink);
    if (m.enabled && route.midi) sinks.push(route.midi.sink);
    route.fanout.setSinks(sinks);
    if (oldInternal && oldInternal !== route.internal) oldInternal.sink.dispose();
  }
}
