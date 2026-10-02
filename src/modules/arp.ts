import type { BusEvent } from '../core/bus';
import type { ArpPattern, ArpRate, ArpSettings } from '../core/store';
import { Voicer } from '../harmony/voicing';
import type { Module, NoteSink } from './module';

/** Grid ticks per Arp step (12 ticks per quarter note). */
export const RATE_TICKS: Record<ArpRate, number> = { '1/4': 12, '1/8': 6, '1/8T': 4, '1/16': 3, '1/16T': 2 };

/** On panic, a step that has not started yet ends this long (s) after its start. */
const PANIC_GAP = 0.001;

/** The Arp's notes: the Keys voicing repeated over `octaves`, low to high. */
export function arpNotes(voicing: number[], octaves: number): number[] {
  const notes: number[] = [];
  for (let o = 0; o < octaves; o++) for (const n of voicing) notes.push(n + 12 * o);
  return notes.sort((a, b) => a - b);
}

/** One cycle of a pattern over `notes` (ascending). For 'random' the module picks from it. */
export function arpCycle(notes: number[], pattern: ArpPattern): number[] {
  if (pattern === 'down') return [...notes].reverse();
  if (pattern === 'upDown') return [...notes, ...notes.slice(1, -1).reverse()];
  return notes;
}

interface Pending {
  note: number;
  on: number; // AudioContext time the note starts
  off: number; // and ends
}

/** Arpeggiates the held chord on the clock grid (spec §5.5). */
export class ArpModule implements Module {
  readonly id = 'arp' as const;
  private voicer = new Voicer(); // follows the same chords as Keys, so it voices identically
  private chord: { voicing: number[]; velocity: number } | null = null;
  private step = 0;
  private pending: Pending[] = []; // started notes whose note-off is not sent yet

  constructor(
    private out: NoteSink,
    private settings: () => ArpSettings,
    private random: () => number = Math.random,
  ) {}

  handle(e: BusEvent): void {
    switch (e.type) {
      case 'chordOn':
        this.step = 0;
        this.chord = { voicing: this.voicer.next(e.chord), velocity: e.velocity };
        break;
      case 'chordChange':
        this.chord = { voicing: this.voicer.next(e.chord), velocity: e.velocity };
        break;
      case 'chordOff':
        this.chord = null;
        break;
      case 'tick':
        this.tick(e.tick, e.at, e.dur);
        break;
      case 'panic':
        this.allNotesOff();
        break;
    }
  }

  allNotesOff(): void {
    // a step scheduled ahead may not have started yet, and a sink cannot cancel it: end it as it starts
    for (const p of this.pending) this.out.noteOff(p.note, p.on + PANIC_GAP);
    this.pending = [];
    this.out.allNotesOff();
    this.chord = null;
    this.step = 0;
    this.voicer.reset();
  }

  private tick(tick: number, at: number, dur: number): void {
    // note-offs due before the next tick go out now, ahead of any note-on at the same time
    const due = this.pending.filter((p) => p.off < at + dur);
    this.pending = this.pending.filter((p) => p.off >= at + dur);
    for (const p of due) this.out.noteOff(p.note, p.off);

    const s = this.settings();
    const stepTicks = RATE_TICKS[s.rate];
    if (!this.chord || tick % stepTicks !== 0) return;
    const cycle = arpCycle(arpNotes(this.chord.voicing, s.octaves), s.pattern);
    const index = s.pattern === 'random' ? Math.floor(this.random() * cycle.length) : this.step % cycle.length;
    const note = cycle[index];
    this.step++;

    // still ringing (the rate just got faster): end it where the new one starts
    if (this.pending.some((p) => p.note === note)) {
      this.pending = this.pending.filter((p) => p.note !== note);
      this.out.noteOff(note, at);
    }
    this.out.noteOn(note, this.chord.velocity, at);
    this.pending.push({ note, on: at, off: at + s.gate * stepTicks * dur });
  }
}
