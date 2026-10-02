import type { ControlTarget } from '../core/store';
import { h } from './dom';

export interface Knob {
  el: HTMLElement;
  value(): number;
  set(value: number): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const angle = (v: number) => -135 + v * 270;

/** A white cylindrical knob (0..1) with an indicator line: vertical drag, mouse wheel, arrow keys. */
export function createKnob(opts: {
  label: string; // its name, for screen readers and the hover tooltip
  value: number;
  onInput: (value: number) => void;
  learn?: ControlTarget;
  size?: 'small' | 'medium' | 'large' | 'dome';
  ticks?: number; // marks around the knob, one per step (Extensions' four levels)
}): Knob {
  let value = opts.value;
  const el = h('div', {
    class: `knob ${opts.size ?? 'medium'}`,
    role: 'slider',
    tabindex: 0,
    title: opts.label,
    'aria-label': opts.label,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'data-learn': opts.learn,
  });
  const ticks = opts.ticks ?? 0;
  for (let i = 0; i < ticks; i++) {
    const tick = h('span', { class: 'tick' });
    tick.style.setProperty('--t', `${angle((i + 0.5) / ticks)}deg`);
    el.append(tick);
  }
  const render = () => {
    el.style.setProperty('--angle', `${angle(value)}deg`);
    el.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  };
  const change = (v: number) => {
    value = clamp01(v);
    render();
    opts.onInput(value);
  };
  el.addEventListener('pointerdown', (e) => {
    const startY = e.clientY;
    const startValue = value;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => change(startValue + (startY - ev.clientY) / 200);
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      change(value - Math.sign(e.deltaY) * 0.04);
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') change(value + 0.05);
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') change(value - 0.05);
  });
  render();
  return {
    el,
    value: () => value,
    set(v: number) {
      value = clamp01(v);
      render();
    },
  };
}
