import type { ControlTarget } from '../core/store';
import { SLOT_IDS, type Looper, type SlotId, type SlotState } from '../modules/looper';
import { frost } from './parts';

const NAMES: Record<SlotId, string> = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge' };
const LEARN: Record<SlotId, ControlTarget> = { verse: 'slotVerse', chorus: 'slotChorus', bridge: 'slotBridge' };
const STATES: SlotState[] = ['empty', 'recording', 'playing', 'overdubbing', 'stopped'];

/** The looper's slot buttons and Rec / Play / Clear (spec §5.7). */
export function createLooperControls(looper: Looper) {
  const slots = Object.fromEntries(
    SLOT_IDS.map((id) => [
      id,
      frost('rect', { class: 'slot', 'data-testid': `slot-${id}`, 'data-learn': LEARN[id], onclick: () => looper.select(id) }),
    ]),
  ) as Record<SlotId, HTMLButtonElement>;
  const rec = frost('round', { title: 'Record', 'data-testid': 'loop-rec', 'data-learn': 'loopRec', onclick: () => looper.record() });
  const play = frost('square', { title: 'Play / stop', 'data-testid': 'loop-play', 'data-learn': 'loopPlay', onclick: () => looper.play() });
  const clear = frost('square', { title: 'Clear', 'data-testid': 'loop-clear', 'data-learn': 'loopClear', onclick: () => looper.clear() });

  function render() {
    const view = looper.view();
    for (const s of view.slots) {
      const b = slots[s.id];
      for (const state of STATES) b.classList.toggle(state, state === s.state); // classList: keeps learn's 'armed'
      b.classList.toggle('selected', s.id === view.selected);
      b.classList.toggle('waiting', s.waiting);
      b.dataset.state = s.state;
      const playing = (s.state === 'playing' || s.state === 'overdubbing') && view.bar !== null;
      b.textContent = NAMES[s.id] + (s.bars ? ` ${playing ? `${view.bar}/` : ''}${s.bars}` : '');
    }
    const selected = view.slots.find((s) => s.id === view.selected)!;
    rec.classList.toggle('lit-red', view.slots.some((s) => s.state === 'recording' || s.state === 'overdubbing'));
    play.classList.toggle('lit-green', selected.state === 'playing' || selected.state === 'overdubbing');
  }
  looper.onChange(render);
  render();
  return { slots, rec, play, clear };
}
