import type { BusEventBody } from '../core/bus';
import { chordSuffix, extensionIntervals } from './extensions';
import { spellRoot } from './spelling';
import { TABLES } from './tables';
import {
  pc,
  SCALE,
  TRIAD_INTERVALS,
  type Chord,
  type ChordRow,
  type ExtLevel,
  type HarmonySettings,
  type PitchClass,
  type Tonality,
} from './theory';

/** Table row for a chord key with pitch class `keyPc` (spec §3.4). */
export function rowForKey(keyPc: PitchClass, s: HarmonySettings): number {
  if (s.layout === 'real') return pc(keyPc - s.tonic);
  return s.tonality === 'major' ? pc(keyPc) : pc(keyPc - 9);
}

function chordName(s: { tonic: PitchClass; tonality: Tonality }, row: ChordRow, level: ExtLevel): string {
  const root = pc(s.tonic + row.rootOffset);
  return spellRoot(s.tonic, s.tonality, row.rootDegree, root) + chordSuffix(row.family, level);
}

function describeFunction(s: HarmonySettings, row: ChordRow, index: number): string {
  if (row.family === 'sec' || row.family === 'secb9') {
    const targetRow = TABLES.secdom[s.tonality][pc(row.rootOffset + 5)];
    return `${row.roman} → ${chordName(s, targetRow, 0)}`;
  }
  return SCALE[s.tonality].includes(index) ? 'diatonic' : 'borrowed';
}

export function chordForRow(index: number, s: HarmonySettings): Chord {
  const row = TABLES[s.table][s.tonality][index];
  return {
    root: pc(s.tonic + row.rootOffset),
    intervals: [...TRIAD_INTERVALS[row.triad], ...extensionIntervals(row.family, s.extLevel)],
    name: chordName(s, row, s.extLevel),
    roman: row.roman,
    fn: describeFunction(s, row, index),
    row: index,
  };
}

export function chordForKey(keyPc: PitchClass, s: HarmonySettings): Chord {
  return chordForRow(rowForKey(keyPc, s), s);
}

interface HeldKey {
  note: number;
  velocity: number;
  down: boolean; // false = released while sustain was on
}

type ChordEvent = Extract<BusEventBody, { type: 'chordOn' | 'chordChange' | 'chordOff' }>;

/**
 * Held chord keys and live changes (spec §3.8). The most recently pressed key sounds;
 * releasing it falls back to the most recent still-held key.
 */
export class ChordEngine {
  private stack: HeldKey[] = [];
  private sustainOn = false;
  private sounding: { chord: Chord; velocity: number; note: number } | null = null;

  constructor(
    private settings: () => HarmonySettings,
    private emit: (event: ChordEvent) => void,
  ) {}

  current(): Chord | null {
    return this.sounding?.chord ?? null;
  }

  keyDown(note: number, velocity: number): void {
    this.stack = this.stack.filter((h) => h.note !== note);
    this.stack.push({ note, velocity, down: true });
    this.update('press');
  }

  keyUp(note: number): void {
    const held = this.stack.find((h) => h.note === note);
    if (!held) return;
    if (this.sustainOn) held.down = false;
    else this.stack = this.stack.filter((h) => h !== held);
    this.update('release');
  }

  setSustain(on: boolean): void {
    this.sustainOn = on;
    if (!on) {
      this.stack = this.stack.filter((h) => h.down);
      this.update('release');
    }
  }

  /** Call when tonic, tonality, layout, table or extension level change. */
  settingsChanged(): void {
    this.update('settings');
  }

  /** Forget held keys and the sounding chord without emitting (used by panic). */
  reset(): void {
    this.stack = [];
    this.sustainOn = false;
    this.sounding = null;
  }

  private update(cause: 'press' | 'release' | 'settings'): void {
    const top = this.stack.at(-1);
    const prev = this.sounding;
    if (!top) {
      if (prev) {
        this.sounding = null;
        this.emit({ type: 'chordOff' });
      }
      return;
    }
    const chord = chordForKey(pc(top.note), this.settings());
    this.sounding = { chord, velocity: top.velocity, note: top.note };
    if (!prev) {
      this.emit({ type: 'chordOn', chord, velocity: top.velocity });
    } else if (cause === 'press') {
      this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: true });
    } else if (cause === 'release') {
      if (pc(prev.note) !== pc(top.note)) {
        this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: true });
      }
    } else if (JSON.stringify(prev.chord) !== JSON.stringify(chord)) {
      this.emit({ type: 'chordChange', chord, velocity: top.velocity, retrigger: false });
    }
  }
}
