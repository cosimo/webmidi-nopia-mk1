import { clampTempo, TapTempo, TEMPO_MAX, TEMPO_MIN } from '../core/clock';
import type { Settings, Store } from '../core/store';
import { h } from './dom';
import { createKnob } from './knob';

const SPAN = TEMPO_MAX - TEMPO_MIN;

/** Tempo knob and field, tap tempo and the metronome toggle (spec §5.4). */
export function createRhythm(store: Store) {
  const taps = new TapTempo();
  const setTempo = (bpm: number) => {
    if (bpm !== store.get().tempo) store.update((s) => (s.tempo = bpm));
  };
  const knob = createKnob({
    label: 'Tempo',
    value: (store.get().tempo - TEMPO_MIN) / SPAN,
    learn: 'tempo',
    onInput: (v) => setTempo(clampTempo(TEMPO_MIN + v * SPAN)),
  });
  const field = h('input', {
    type: 'number',
    min: TEMPO_MIN,
    max: TEMPO_MAX,
    'data-testid': 'tempo',
    onchange: () => setTempo(clampTempo(Number(field.value) || store.get().tempo)),
  });
  const tap = h('button', {
    type: 'button',
    'data-testid': 'tap',
    onclick: () => {
      const bpm = taps.tap(performance.now());
      if (bpm !== null) setTempo(bpm);
    },
  }, 'Tap');
  const click = h('button', {
    type: 'button',
    'data-testid': 'metronome',
    onclick: () => store.update((s) => (s.metronome = !s.metronome)),
  }, 'Click');
  const el = h(
    'div',
    { class: 'rhythm' },
    knob.el,
    h('label', { class: 'bpm' }, field, ' BPM'),
    h('div', { class: 'rhythm-buttons' }, tap, click),
  );
  return {
    el,
    render(s: Settings) {
      if (clampTempo(TEMPO_MIN + knob.value() * SPAN) !== s.tempo) knob.set((s.tempo - TEMPO_MIN) / SPAN);
      if (document.activeElement !== field) field.value = String(s.tempo);
      click.classList.toggle('active', s.metronome);
    },
  };
}
