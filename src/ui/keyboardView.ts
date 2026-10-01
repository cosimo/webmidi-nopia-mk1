import type { Settings } from '../core/store';
import { chordForKey } from '../harmony/chordEngine';
import { pc } from '../harmony/theory';
import type { InputRouter } from '../input/inputRouter';
import { h } from './dom';

const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * On-screen keyboard: one octave of chord zone below the split, 20 melody keys above.
 * Chord keys show the chord and roman numeral they currently play.
 */
export function createKeyboardView(router: InputRouter) {
  const el = h('div', { class: 'keyboard' });
  const keys = new Map<number, HTMLElement>();
  let builtFor = -1;

  router.onNote((note, on) => keys.get(note)?.classList.toggle('pressed', on));

  function build(split: number) {
    el.replaceChildren();
    keys.clear();
    let whites = 0;
    for (let n = Math.max(0, split - 12); n <= Math.min(127, split + 19); n++) {
      const black = BLACK.has(pc(n));
      const key = h('div', { class: black ? 'key black' : 'key white', 'data-testid': `key-${n}` });
      if (black) key.style.left = `calc(${whites} * var(--white-w) - var(--black-w) / 2)`;
      else whites++;
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
    builtFor = split;
  }

  return {
    el,
    render(s: Settings) {
      if (builtFor !== s.splitPoint) build(s.splitPoint);
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
