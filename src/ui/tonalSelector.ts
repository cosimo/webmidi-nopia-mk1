import type { Settings, Store } from '../core/store';
import { TONIC_NAMES } from '../harmony/spelling';
import { h } from './dom';

const BLACK = [1, 3, 6, 8, 10];

/** 12 round buttons laid out like a piano octave; clicking one sets the tonic. */
export function createTonalSelector(store: Store) {
  const buttons = Array.from({ length: 12 }, (_, pc) =>
    h('button', {
      class: BLACK.includes(pc) ? 'tonic black' : 'tonic',
      'data-testid': `tonic-${pc}`,
      style: `grid-column: ${2 * [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][pc] + (BLACK.includes(pc) ? 2 : 1)} / span 2`,
      onclick: () => store.update((s) => (s.tonic = pc)),
    }),
  );
  const el = h('div', { class: 'tonal-selector', 'aria-label': 'Tonic' }, ...buttons);
  return {
    el,
    render(s: Settings) {
      buttons.forEach((b, pc) => {
        b.textContent = TONIC_NAMES[s.tonality][pc];
        b.classList.toggle('active', pc === s.tonic);
      });
    },
  };
}
