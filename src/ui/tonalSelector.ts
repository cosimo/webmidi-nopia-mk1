import type { Settings, Store } from '../core/store';
import { TONIC_NAMES } from '../harmony/spelling';
import { frost } from './parts';

/** The 12 tonic buttons, by pitch class; the faceplate lays them out like a piano octave. */
export function createTonalSelector(store: Store) {
  const buttons = Array.from({ length: 12 }, (_, pc) =>
    frost('round', { class: 'tonic', 'data-testid': `tonic-${pc}`, onclick: () => store.update((s) => (s.tonic = pc)) }),
  );
  return {
    buttons,
    render(s: Settings) {
      buttons.forEach((b, pc) => {
        b.textContent = TONIC_NAMES[s.tonality][pc];
        b.classList.toggle('active', pc === s.tonic);
      });
    },
  };
}
