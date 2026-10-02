import type { Settings } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import { pc } from '../harmony/theory';
import type { InputRouter } from '../input/inputRouter';
import { h } from './dom';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * On-screen keys for the notes `range` gives (lo..hi): the white keys share the width, the black
 * keys sit between them. Chord-zone keys show the chord and roman numeral they currently play.
 */
export function createKeyboardView(router: InputRouter, range: (s: Settings) => [number, number], cls: string) {
  const el = h('div', { class: `keyboard ${cls}` });
  const keys = new Map<number, HTMLElement>();
  let builtFor = '';

  router.onNote((note, on) => keys.get(note)?.classList.toggle('pressed', on));

  function build(lo: number, hi: number) {
    el.replaceChildren();
    keys.clear();
    const notes = Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
    const whites = notes.filter((n) => !BLACK.has(pc(n))).length;
    let left = 0; // white keys so far
    for (const n of notes) {
      const black = BLACK.has(pc(n));
      const key = h('div', { class: black ? 'key black' : 'key white', 'data-testid': `key-${n}` });
      if (black) key.style.left = `${(left / whites) * 100}%`;
      else {
        key.style.width = `${100 / whites}%`;
        left++;
      }
      key.addEventListener('pointerdown', (e) => {
        key.setPointerCapture(e.pointerId);
        router.noteOn(n, 100);
      });
      const release = () => router.noteOff(n);
      key.addEventListener('pointerup', release);
      key.addEventListener('pointercancel', release);
      keys.set(n, key);
      el.append(key);
    }
    el.style.setProperty('--whites', String(whites));
  }

  return {
    el,
    render(s: Settings) {
      const [lo, hi] = range(s).map((n) => Math.min(127, Math.max(0, n)));
      if (builtFor !== `${lo}-${hi}`) {
        build(lo, hi);
        builtFor = `${lo}-${hi}`;
      }
      for (const [n, key] of keys) {
        const chordKey = n < s.splitPoint && n !== s.keySelectNote;
        key.classList.toggle('chord-zone', chordKey);
        key.classList.toggle('key-select', n === s.keySelectNote);
        if (chordKey) {
          const chord = chordForKey(pc(n), s);
          key.replaceChildren(h('span', { class: 'key-chord' }, chord.name), h('span', { class: 'key-roman' }, chord.roman));
        } else {
          key.replaceChildren(n === s.keySelectNote ? h('span', { class: 'key-roman' }, 'key') : '');
        }
      }
    },
  };
}
