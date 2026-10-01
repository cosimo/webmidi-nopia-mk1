import type { BusEventBody } from '../core/bus';
import type { Store } from '../core/store';
import { pc } from '../harmony/theory';

export interface RouterDeps {
  engine: { keyDown(note: number, velocity: number): void; keyUp(note: number): void; setSustain(on: boolean): void };
  bus: { emit(event: BusEventBody): void };
  store: Store;
  controls: { handleCC(channel: number, cc: number, value: number): boolean };
}

type Zone = 'chord' | 'melody' | 'select' | 'tonic';
type NoteListener = (note: number, on: boolean) => void;

/** Routes raw MIDI and on-screen key presses (spec §4.2). */
export class InputRouter {
  private zones = new Map<number, Zone>(); // held note → the zone it was routed to on note-on
  private capture: ((note: number) => void) | null = null;
  private sustainOn = false;
  private listeners: NoteListener[] = [];

  constructor(private deps: RouterDeps) {}

  handleMidi(data: ArrayLike<number>): void {
    const status = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    if (status === 0x90 && data[2] > 0) this.noteOn(data[1], data[2]);
    else if (status === 0x80 || status === 0x90) this.noteOff(data[1]);
    else if (status === 0xb0) this.controlChange(channel, data[1], data[2]);
    else if (status === 0xe0) {
      const bend = (((data[2] << 7) | data[1]) - 8192) / 8192;
      this.deps.bus.emit({ type: 'pitchBend', bend });
    }
  }

  noteOn(note: number, velocity: number): void {
    if (this.capture) {
      const cb = this.capture;
      this.capture = null;
      cb(note);
      return;
    }
    if (this.zones.has(note)) this.noteOff(note);
    const s = this.deps.store.get();
    let zone: Zone;
    if (note === s.keySelectNote) {
      zone = 'select';
    } else if (note < s.splitPoint) {
      if ([...this.zones.values()].includes('select')) {
        zone = 'tonic';
        this.deps.store.update((d) => (d.tonic = pc(note)));
      } else {
        zone = 'chord';
        this.deps.engine.keyDown(note, velocity);
      }
    } else {
      zone = 'melody';
      this.deps.bus.emit({ type: 'melodyOn', note, velocity });
    }
    this.zones.set(note, zone);
    for (const l of this.listeners) l(note, true);
  }

  noteOff(note: number): void {
    const zone = this.zones.get(note);
    if (zone === undefined) return;
    this.zones.delete(note);
    if (zone === 'chord') this.deps.engine.keyUp(note);
    if (zone === 'melody') this.deps.bus.emit({ type: 'melodyOff', note });
    for (const l of this.listeners) l(note, false);
  }

  /** The next note-on is passed to `cb` instead of being played ("press a key to set"). */
  captureNextNote(cb: ((note: number) => void) | null): void {
    this.capture = cb;
  }

  onNote(listener: NoteListener): void {
    this.listeners.push(listener);
  }

  /** Forget held notes and sustain (used by panic). */
  reset(): void {
    for (const note of [...this.zones.keys()]) {
      this.zones.delete(note);
      for (const l of this.listeners) l(note, false);
    }
    this.sustainOn = false;
    this.capture = null;
  }

  private controlChange(channel: number, cc: number, value: number): void {
    if (this.deps.controls.handleCC(channel, cc, value)) return;
    if (cc === 64) {
      const on = value >= 64;
      if (on === this.sustainOn) return;
      this.sustainOn = on;
      this.deps.engine.setSustain(on);
      this.deps.bus.emit({ type: 'sustain', on });
    } else if (cc === 1) {
      this.deps.bus.emit({ type: 'mod', value });
    }
  }
}
