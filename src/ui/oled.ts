import type { Settings } from '../core/store';
import { TONIC_NAMES } from '../harmony/spelling';
import type { Chord } from '../harmony/theory';
import { h } from './dom';

/** The OLED-style display: chord name, roman numeral, function, and the current key/mode. */
export function createOled() {
  const name = h('div', { class: 'oled-chord', 'data-testid': 'oled-chord' }, '—');
  const roman = h('div', { class: 'oled-roman', 'data-testid': 'oled-roman' });
  const fn = h('div', { class: 'oled-fn', 'data-testid': 'oled-fn' });
  const status = h('div', { class: 'oled-status', 'data-testid': 'oled-status' });
  const el = h('div', { class: 'oled idle' }, name, roman, fn, status);
  return {
    el,
    /** null = silence: the last chord stays visible, dimmed. */
    showChord(chord: Chord | null) {
      el.classList.toggle('idle', chord === null);
      if (!chord) return;
      name.textContent = chord.name;
      roman.textContent = chord.roman;
      fn.textContent = chord.fn;
    },
    showStatus(s: Settings) {
      const table = s.table === 'secdom' ? 'secondary dominants' : 'borrowed';
      status.textContent = `${TONIC_NAMES[s.tonality][s.tonic]} ${s.tonality} · ${s.layout} · ${table}`;
    },
  };
}
