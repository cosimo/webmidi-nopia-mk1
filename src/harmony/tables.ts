import type { ChordRow, ExtFamily, TableId, Tonality, Triad } from './theory';

function r(rootOffset: number, rootDegree: number, triad: Triad, family: ExtFamily, roman: string): ChordRow {
  return { rootOffset, rootDegree, triad, family, roman };
}

// Secondary-dominant table (spec §3.2). Index = row = semitones from tonic to the pressed key.
const SECDOM_MAJOR: ChordRow[] = [
  r(0, 1, 'maj', 'maj', 'I'),
  r(9, 6, 'maj', 'secb9', 'V7/ii'),
  r(2, 2, 'min', 'min', 'ii'),
  r(11, 7, 'maj', 'secb9', 'V7/iii'),
  r(4, 3, 'min', 'minPhr', 'iii'),
  r(5, 4, 'maj', 'maj', 'IV'),
  r(2, 2, 'maj', 'sec', 'V7/V'),
  r(7, 5, 'maj', 'dom', 'V'),
  r(4, 3, 'maj', 'secb9', 'V7/vi'),
  r(9, 6, 'min', 'min', 'vi'),
  r(0, 1, 'maj', 'sec', 'V7/IV'),
  r(11, 7, 'dim', 'dim', 'vii°'),
];

const SECDOM_MINOR: ChordRow[] = [
  r(0, 1, 'min', 'min', 'i'),
  r(3, 3, 'maj', 'sec', 'V7/VI'),
  r(2, 2, 'dim', 'dim', 'ii°'),
  r(3, 3, 'maj', 'maj', 'III'),
  r(0, 1, 'maj', 'secb9', 'V7/iv'),
  r(5, 4, 'min', 'min', 'iv'),
  r(2, 2, 'maj', 'secb9', 'V7/V'),
  r(7, 5, 'min', 'minPhr', 'v'),
  r(8, 6, 'maj', 'maj', 'VI'),
  r(5, 4, 'maj', 'sec', 'V7/VII'),
  r(10, 7, 'maj', 'dom', 'VII'),
  r(7, 5, 'maj', 'secb9', 'V7'),
];

// Borrowed table (spec §3.3): diatonic rows as above, chromatic rows replaced.
const BORROWED_MAJOR: ChordRow[] = SECDOM_MAJOR.map((row, i) => {
  switch (i) {
    case 1: return r(1, 2, 'maj', 'maj', '♭II');
    case 3: return r(3, 3, 'maj', 'maj', '♭III');
    case 6: return r(6, 4, 'dim', 'dim', '♯iv°');
    case 8: return r(8, 6, 'maj', 'maj', '♭VI');
    case 10: return r(10, 7, 'maj', 'dom', '♭VII');
    default: return row;
  }
});

const BORROWED_MINOR: ChordRow[] = SECDOM_MINOR.map((row, i) => {
  switch (i) {
    case 1: return r(1, 2, 'maj', 'maj', '♭II');
    case 4: return r(4, 3, 'min', 'minPhr', 'iii');
    case 6: return r(6, 4, 'dim', 'dim7', '♯iv°');
    case 9: return r(9, 6, 'min', 'min', 'vi');
    case 11: return r(11, 7, 'dim', 'dim7', 'vii°');
    default: return row;
  }
});

export const TABLES: Record<TableId, Record<Tonality, ChordRow[]>> = {
  secdom: { major: SECDOM_MAJOR, minor: SECDOM_MINOR },
  borrowed: { major: BORROWED_MAJOR, minor: BORROWED_MINOR },
};
