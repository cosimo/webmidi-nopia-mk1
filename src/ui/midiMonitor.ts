import { midiNoteName } from '../harmony/theory';
import { h } from './dom';

const MAX_LINES = 200;

/** One-line description of a MIDI message; null for clock/active-sensing noise. */
export function describeMidi(data: ArrayLike<number>): string | null {
  const status = data[0];
  if (status === 0xf8 || status === 0xfe) return null;
  if (status >= 0xf0) return `System 0x${status.toString(16)}`;
  const ch = `ch${(status & 0x0f) + 1}`;
  const [d1, d2] = [data[1], data[2]];
  switch (status & 0xf0) {
    case 0x90:
      if (d2 > 0) return `Note on    ${ch}  ${d1} ${midiNoteName(d1)}  vel ${d2}`;
      return `Note off   ${ch}  ${d1} ${midiNoteName(d1)}`;
    case 0x80:
      return `Note off   ${ch}  ${d1} ${midiNoteName(d1)}`;
    case 0xb0:
      return `CC         ${ch}  #${d1} = ${d2}`;
    case 0xe0:
      return `Pitch bend ${ch}  ${(d2 << 7) | d1}`;
    case 0xd0:
      return `Aftertouch ${ch}  ${d1}`;
    case 0xa0:
      return `Poly AT    ${ch}  ${d1} = ${d2}`;
    default:
      return `Program    ${ch}  ${d1}`;
  }
}

/** Scrolling log of incoming MIDI, newest first. */
export function createMidiMonitor() {
  const list = h('ol', { class: 'monitor-lines', 'data-testid': 'monitor' });
  const el = h('section', { class: 'monitor', hidden: true }, h('h2', {}, 'MIDI monitor'), list);
  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
    },
    log(data: ArrayLike<number>) {
      if (el.hidden) return;
      const text = describeMidi(data);
      if (text === null) return;
      list.prepend(h('li', {}, text));
      while (list.childElementCount > MAX_LINES) list.lastElementChild!.remove();
    },
  };
}
