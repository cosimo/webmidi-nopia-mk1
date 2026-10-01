import { pc, type PitchClass, type Tonality } from './theory';

/** Tonic names offered by the Tonal Selector, indexed by pitch class. */
export const TONIC_NAMES: Record<Tonality, string[]> = {
  major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
  minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
};

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS: Record<number, string> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/**
 * Spell a chord root by scale-degree letter: letter = tonic letter + (rootDegree − 1),
 * with the accidental chosen to hit `root`.
 */
export function spellRoot(
  tonic: PitchClass,
  tonality: Tonality,
  rootDegree: number,
  root: PitchClass,
): string {
  const tonicLetter = LETTERS.indexOf(TONIC_NAMES[tonality][tonic][0]);
  const letter = (tonicLetter + rootDegree - 1) % 7;
  let diff = pc(root - NATURAL_PC[letter]);
  if (diff > 6) diff -= 12;
  const accidental = ACCIDENTALS[diff];
  if (accidental === undefined) {
    throw new Error(`cannot spell pc ${root} on letter ${LETTERS[letter]}`);
  }
  return LETTERS[letter] + accidental;
}
