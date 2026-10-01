import { describe, expect, it } from 'vitest';
import { chordForKey, chordForRow, rowForKey } from './chordEngine';
import { TABLES } from './tables';
import { pc, SCALE, type HarmonySettings, type TableId, type Tonality } from './theory';

const base: HarmonySettings = { tonic: 0, tonality: 'major', layout: 'real', table: 'secdom', extLevel: 0 };
const TONALITIES: Tonality[] = ['major', 'minor'];
const TABLE_IDS: TableId[] = ['secdom', 'borrowed'];

function names(s: Partial<HarmonySettings>): string[] {
  const settings = { ...base, ...s };
  return Array.from({ length: 12 }, (_, row) => chordForRow(row, settings).name);
}

describe('spec tables at extension level 0', () => {
  it('secdom, C major (§3.2)', () => {
    expect(names({ tonic: 0, tonality: 'major', table: 'secdom' })).toEqual(
      ['C', 'A7', 'Dm', 'B7', 'Em', 'F', 'D7', 'G', 'E7', 'Am', 'C7', 'B°'],
    );
  });

  it('secdom, A minor (§3.2)', () => {
    expect(names({ tonic: 9, tonality: 'minor', table: 'secdom' })).toEqual(
      ['Am', 'C7', 'B°', 'C', 'A7', 'Dm', 'B7', 'Em', 'F', 'D7', 'G', 'E7'],
    );
  });

  it('borrowed, C major (§3.3)', () => {
    expect(names({ tonic: 0, tonality: 'major', table: 'borrowed' })).toEqual(
      ['C', 'D♭', 'Dm', 'E♭', 'Em', 'F', 'F♯°', 'G', 'A♭', 'Am', 'B♭', 'B°'],
    );
  });

  it('borrowed, A minor (§3.3)', () => {
    expect(names({ tonic: 9, tonality: 'minor', table: 'borrowed' })).toEqual(
      ['Am', 'B♭', 'B°', 'C', 'C♯m', 'Dm', 'D♯°', 'Em', 'F', 'F♯m', 'G', 'G♯°'],
    );
  });

  it('roman numerals, secdom C major', () => {
    const romans = Array.from({ length: 12 }, (_, row) => chordForRow(row, base).roman);
    expect(romans).toEqual(
      ['I', 'V7/ii', 'ii', 'V7/iii', 'iii', 'IV', 'V7/V', 'V', 'V7/vi', 'vi', 'V7/IV', 'vii°'],
    );
  });
});

describe('every tonic × tonality × table', () => {
  it('diatonic rows are identical in both tables', () => {
    for (const tonality of TONALITIES) {
      for (const row of SCALE[tonality]) {
        expect(TABLES.borrowed[tonality][row]).toEqual(TABLES.secdom[tonality][row]);
      }
    }
  });

  it('transposes: the root is tonic + rootOffset and the name spells that root', () => {
    const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const ACC: Record<string, number> = { '𝄫': -2, '♭': -1, '♯': 1, '𝄪': 2 };
    for (const tonality of TONALITIES) {
      for (const table of TABLE_IDS) {
        for (let tonic = 0; tonic < 12; tonic++) {
          for (let row = 0; row < 12; row++) {
            const chord = chordForRow(row, { ...base, tonic, tonality, table });
            expect(chord.root).toBe(pc(tonic + TABLES[table][tonality][row].rootOffset));
            const m = /^([A-G])(𝄫|♭|♯|𝄪)?/u.exec(chord.name)!;
            expect(pc(LETTER_PC[m[1]] + (m[2] ? ACC[m[2]] : 0))).toBe(chord.root);
          }
        }
      }
    }
  });

  it('spells other keys by scale degree', () => {
    expect(names({ tonic: 3, tonality: 'major', table: 'borrowed' })).toEqual(
      ['E♭', 'F♭', 'Fm', 'G♭', 'Gm', 'A♭', 'A°', 'B♭', 'C♭', 'Cm', 'D♭', 'D°'],
    );
    expect(names({ tonic: 1, tonality: 'minor', table: 'borrowed' })[6]).toBe('F𝄪°');
    expect(names({ tonic: 2, tonality: 'major', table: 'secdom' })).toEqual(
      ['D', 'B7', 'Em', 'C♯7', 'F♯m', 'G', 'E7', 'A', 'F♯7', 'Bm', 'D7', 'C♯°'],
    );
  });
});

describe('rowForKey (§3.4)', () => {
  it('real mode: row = key − tonic', () => {
    expect(rowForKey(2, { ...base, tonic: 2 })).toBe(0);
    expect(rowForKey(0, { ...base, tonic: 2 })).toBe(10);
  });

  it('static major: the C key is always I', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      expect(rowForKey(0, { ...base, layout: 'static', tonic })).toBe(0);
    }
  });

  it('static minor: the A key is always i', () => {
    for (let tonic = 0; tonic < 12; tonic++) {
      expect(rowForKey(9, { ...base, layout: 'static', tonality: 'minor', tonic })).toBe(0);
    }
  });

  it('static mode: white keys always give the diatonic chords', () => {
    const WHITE = [0, 2, 4, 5, 7, 9, 11];
    for (const tonality of TONALITIES) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const s = { ...base, layout: 'static' as const, tonality, tonic };
        const rows = WHITE.map((k) => rowForKey(k, s)).sort((a, b) => a - b);
        expect(rows).toEqual([...SCALE[tonality]].sort((a, b) => a - b));
      }
    }
  });
});

describe('chordForKey', () => {
  it('plays the same chords in real and static mode in C major / A minor', () => {
    for (const tonality of TONALITIES) {
      for (const table of TABLE_IDS) {
        const tonic = tonality === 'major' ? 0 : 9;
        for (let key = 0; key < 12; key++) {
          const real = chordForKey(key, { ...base, tonality, table, tonic, layout: 'real' });
          const stat = chordForKey(key, { ...base, tonality, table, tonic, layout: 'static' });
          expect(stat.name).toBe(real.name);
        }
      }
    }
  });

  it('static mode in D major: the C key plays D, the G key plays A', () => {
    const s = { ...base, tonic: 2, layout: 'static' as const };
    expect(chordForKey(0, s).name).toBe('D');
    expect(chordForKey(7, s).name).toBe('A');
  });

  it('builds intervals from triad + extensions', () => {
    const dm9 = chordForKey(2, { ...base, extLevel: 2 });
    expect(dm9.name).toBe('Dm9');
    expect(dm9.intervals).toEqual([0, 3, 7, 10, 14]);
    const a7b9 = chordForKey(1, { ...base, extLevel: 2 });
    expect(a7b9.name).toBe('A7♭9');
    expect(a7b9.intervals).toEqual([0, 4, 7, 10, 13]);
  });

  it('describes the function of each chord', () => {
    expect(chordForKey(1, base).fn).toBe('V7/ii → Dm');
    expect(chordForKey(8, { ...base, tonic: 9, tonality: 'minor' }).fn).toBe('V7 → Am');
    expect(chordForKey(2, base).fn).toBe('diatonic');
    expect(chordForKey(3, { ...base, table: 'borrowed' }).fn).toBe('borrowed');
  });
});
