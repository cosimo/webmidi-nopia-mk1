export type PitchClass = number; // 0..11, C = 0
export type Tonality = 'major' | 'minor';
export type LayoutMode = 'real' | 'static';
export type TableId = 'secdom' | 'borrowed';
export type ExtFamily = 'maj' | 'dom' | 'sec' | 'secb9' | 'min' | 'minPhr' | 'dim' | 'dim7';
export type Triad = 'maj' | 'min' | 'dim';
export type ExtLevel = 0 | 1 | 2 | 3;

export interface ChordRow {
  rootOffset: number; // semitones above tonic
  rootDegree: number; // 1..7 scale-degree letter, used for spelling
  triad: Triad;
  family: ExtFamily;
  roman: string; // e.g. 'ii', 'V7/ii', '♭VII'
}

export interface Chord {
  root: PitchClass;
  intervals: number[]; // semitones above root, triad + extensions
  name: string; // e.g. 'Dm9', 'A7♭9'
  roman: string;
  fn: string; // e.g. 'V7/ii → Dm', 'diatonic', 'borrowed'
  row: number; // 0..11, the table row that produced it
}

export interface HarmonySettings {
  tonic: PitchClass;
  tonality: Tonality;
  layout: LayoutMode;
  table: TableId;
  extLevel: ExtLevel;
}

export const TRIAD_INTERVALS: Record<Triad, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
};

/** Semitone offsets of the scale degrees above the tonic. */
export const SCALE: Record<Tonality, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export function pc(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** MIDI note number to a display name, e.g. 60 → 'C4'. */
export function midiNoteName(note: number): string {
  return `${SHARP_NAMES[pc(note)]}${Math.floor(note / 12) - 1}`;
}
