import type { ModuleId } from '../core/store';
import { SLOT_IDS, type SlotId } from '../modules/looper';
import { h } from './dom';
import { box, engraved, place } from './parts';

// Where the controls sit, in % of the faceplate's width and height, after the Nopia mk1 photo
// (nopia-mk1.webp): its knobs, frosted buttons, keyboard and tonal selector keep their places.
const VOLUME_X: Record<ModuleId, number> = { keys: 3.6, pad: 8.4, bass: 13.2, melody: 18, arp: 22.8, strum: 27.6 };
const SLOT_X: Record<SlotId, number> = { verse: 43.5, chorus: 50.1, bridge: 56.6 };
const TONIC_X = [63.9, 66, 68.1, 70.3, 72.4, 76.6, 78.7, 80.8, 82.9, 85, 87.2, 89.3]; // by pitch class
const BLACK = new Set([1, 3, 6, 8, 10]);

export interface FaceplateParts {
  modules: { id: ModuleId; group: HTMLElement; knob: HTMLElement; label: HTMLElement; popover: HTMLElement }[];
  looper: { rec: HTMLElement; slots: Record<SlotId, HTMLElement>; play: HTMLElement; clear: HTMLElement };
  panic: HTMLElement;
  layout: HTMLElement;
  layoutLabel: HTMLElement;
  tonality: HTMLElement;
  tonalityLabel: HTMLElement;
  table: HTMLElement;
  tableLabel: HTMLElement;
  tempo: HTMLElement;
  bpm: HTMLElement;
  tap: HTMLElement;
  click: HTMLElement;
  extensions: HTMLElement;
  modStrip: HTMLElement;
  modStripLabel: HTMLElement;
  reverb: HTMLElement;
  master: HTMLElement;
  tone: HTMLElement;
  delay: HTMLElement;
  display: HTMLElement;
  chordKeys: HTMLElement;
  keyButton: HTMLElement;
  tonics: HTMLElement[]; // by pitch class
}

/** The panel, laid out like the Nopia mk1's faceplate (spec §7). */
export function createFaceplate(p: FaceplateParts): HTMLElement {
  const label = (text: string, x: number, y: number) => place(engraved(text), x, y);
  const plate = h('div', { class: 'faceplate' });

  for (const m of p.modules) {
    const x = VOLUME_X[m.id];
    place(m.knob, x, 7.5, 2.8);
    place(m.label, x, 13);
    Object.assign(m.popover.style, { left: `${x - 1.6}%`, top: '16%' });
    plate.append(m.group);
  }

  plate.append(place(p.looper.rec, 37.9, 8.1, 1.9), label('Rec', 37.9, 13));
  for (const id of SLOT_IDS) plate.append(place(p.looper.slots[id], SLOT_X[id], 8.1, 5.8, 2.8));
  plate.append(
    place(p.looper.play, 85.6, 9.9, 3.6), label('Play', 85.6, 16.6),
    place(p.looper.clear, 90, 9.9, 3.6), label('Clear', 90, 16.6),
    place(p.panic, 94.4, 9.9, 3.6), label('Panic', 94.4, 16.6),

    place(p.layout, 5.4, 28.9, 4.3), place(p.layoutLabel, 5.4, 35.2),
    place(p.tonality, 9.9, 39.5, 4.3), place(p.tonalityLabel, 9.9, 45.8),
    place(p.table, 12.6, 25.5, 1.6), place(p.tableLabel, 12.6, 30),

    place(p.tempo, 21, 29, 5.8), place(h('div', { class: 'engraved' }, 'Tempo ', p.bpm), 21, 37.6),
    place(p.tap, 21, 44, 2.4), label('Tap', 21, 48.3),
    place(p.click, 28.3, 22.1, 1.6), label('Click', 28.3, 26.6),

    place(p.extensions, 50.2, 29, 8.6), label('Extensions', 50.2, 41),

    place(p.modStrip, 68.5, 20.5, 1.6), place(p.modStripLabel, 68.5, 25),
    place(p.reverb, 78, 29, 5.8), label('Reverb', 78, 37.6),
    place(p.master, 92.4, 27.5, 6.2), label('Master', 92.4, 36.4),

    box(p.display, 57.5, 42.5, 31, 20.5),

    place(p.tone, 4.1, 62, 2.8), label('Tone', 4.1, 67.2),
    place(p.delay, 4.1, 76, 2.8), label('Delay', 4.1, 81.2),
    box(p.chordKeys, 10.4, 53.4, 39.6, 38.6),
    place(p.keyButton, 53.6, 84.7, 3.7, 2.7), label('Key', 53.6, 89.2),
  );
  p.tonics.forEach((b, pc) => plate.append(place(b, TONIC_X[pc], BLACK.has(pc) ? 75.5 : 83, 3.55)));
  return plate;
}
