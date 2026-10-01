import type { ControlTarget } from '../core/store';
import { h } from './dom';

export interface Knob {
  el: HTMLElement;
  value(): number;
  set(value: number): void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A round knob (0..1): vertical drag, mouse wheel, arrow keys. */
export function createKnob(opts: {
  label: string;
  value: number;
  onInput: (value: number) => void;
  learn?: ControlTarget;
  large?: boolean;
}): Knob {
  let value = opts.value;
  const dial = h('div', {
    class: 'knob-dial',
    role: 'slider',
    tabindex: 0,
    'aria-label': opts.label,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
  });
  const el = h(
    'div',
    { class: opts.large ? 'knob large' : 'knob', 'data-learn': opts.learn },
    dial,
    h('span', { class: 'knob-label' }, opts.label),
  );
  const render = () => {
    dial.style.setProperty('--angle', `${-135 + value * 270}deg`);
    dial.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  };
  const change = (v: number) => {
    value = clamp01(v);
    render();
    opts.onInput(value);
  };
  dial.addEventListener('pointerdown', (e) => {
    const startY = e.clientY;
    const startValue = value;
    dial.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => change(startValue + (startY - ev.clientY) / 200);
    const up = () => {
      dial.removeEventListener('pointermove', move);
      dial.removeEventListener('pointerup', up);
    };
    dial.addEventListener('pointermove', move);
    dial.addEventListener('pointerup', up);
  });
  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      change(value - Math.sign(e.deltaY) * 0.04);
    },
    { passive: false },
  );
  dial.addEventListener('keydown', (e) => {
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
