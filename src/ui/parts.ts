import { h, type Attrs } from './dom';

/** Centres `el` at x%, y% of the faceplate, `w`% wide (and `ht`% high when given). */
export function place<T extends HTMLElement>(el: T, x: number, y: number, w?: number, ht?: number): T {
  el.classList.add('placed');
  el.style.left = `${x}%`;
  el.style.top = `${y}%`;
  if (w !== undefined) el.style.width = `${w}%`;
  if (ht !== undefined) el.style.height = `${ht}%`;
  return el;
}

/** Positions `el` on the faceplate by its top-left corner. */
export function box<T extends HTMLElement>(el: T, left: number, top: number, w: number, ht: number): T {
  el.classList.add('boxed');
  Object.assign(el.style, { left: `${left}%`, top: `${top}%`, width: `${w}%`, height: `${ht}%` });
  return el;
}

/** A small-caps label engraved into the faceplate. */
export function engraved(text: string, attrs: Attrs = {}): HTMLElement {
  return h('div', { ...attrs, class: `engraved ${attrs.class ?? ''}`.trim() }, text);
}

/** A frosted, translucent push button; the classes `lit`, `lit-green` and `lit-red` make it glow. */
export function frost(shape: 'round' | 'square' | 'rect', attrs: Attrs, ...children: (Node | string)[]): HTMLButtonElement {
  return h('button', { type: 'button', ...attrs, class: `frost ${shape} ${attrs.class ?? ''}`.trim() }, ...children);
}

/** A mini toggle switch: the lever is up (class `active`) when on. */
export function toggleSwitch(attrs: Attrs) {
  const el = h('button', { type: 'button', ...attrs, class: 'switch' });
  return {
    el,
    set(on: boolean) {
      el.classList.toggle('active', on);
    },
  };
}
