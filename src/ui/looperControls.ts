import type { ControlTarget } from '../core/store';
import { SLOT_IDS, type Looper, type SlotId, type SlotState } from '../modules/looper';
import { h } from './dom';

const NAMES: Record<SlotId, string> = { verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge' };
const LEARN: Record<SlotId, ControlTarget> = { verse: 'slotVerse', chorus: 'slotChorus', bridge: 'slotBridge' };
const STATES: SlotState[] = ['empty', 'recording', 'playing', 'overdubbing', 'stopped'];

/** The looper's slot buttons and Rec / Play / Clear, in the header (spec §5.7, §7). */
export function createLooperControls(looper: Looper) {
  const slots = SLOT_IDS.map((id) =>
    h('button', { class: 'slot', 'data-testid': `slot-${id}`, 'data-learn': LEARN[id], onclick: () => looper.select(id) }),
  );
  const button = (label: string, id: string, learn: ControlTarget, action: () => void) =>
    h('button', { 'data-testid': id, 'data-learn': learn, onclick: action }, label);
  const el = h(
    'div',
    { class: 'looper' },
    ...slots,
    button('Rec', 'loop-rec', 'loopRec', () => looper.record()),
    button('Play', 'loop-play', 'loopPlay', () => looper.play()),
    button('Clear', 'loop-clear', 'loopClear', () => looper.clear()),
  );

  function render() {
    const view = looper.view();
    view.slots.forEach((s, i) => {
      const b = slots[i];
      for (const state of STATES) b.classList.toggle(state, state === s.state); // classList: keeps learn's 'armed'
      b.classList.toggle('selected', s.id === view.selected);
      b.classList.toggle('waiting', s.waiting);
      b.dataset.state = s.state;
      const playing = (s.state === 'playing' || s.state === 'overdubbing') && view.bar !== null;
      b.textContent = NAMES[s.id] + (s.bars ? ` ${playing ? `${view.bar}/` : ''}${s.bars}` : '');
    });
  }
  looper.onChange(render);
  render();
  return { el };
}
