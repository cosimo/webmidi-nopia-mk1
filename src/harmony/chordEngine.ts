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
