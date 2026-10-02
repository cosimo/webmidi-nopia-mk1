import { CONTROL_TARGETS, type EncoderMode, type Settings, type Store } from '../core/store';
import { midiNoteName } from '../harmony/theory';
import { TARGET_INFO, type ControlMap } from '../input/controlMap';
import type { InputRouter } from '../input/inputRouter';
import { createSelect, h } from './dom';

const MODES = [
  { value: 'detect', label: 'auto' },
  { value: 'absolute', label: 'absolute' },
  { value: 'relative', label: 'relative' },
];

/** Settings drawer: split point, key-select note and the control mappings (the rest is on the panel). */
export function createSettings(deps: { store: Store; router: InputRouter; controls: ControlMap }) {
  const { store, router, controls } = deps;

  function noteField(label: string, testid: string, field: 'splitPoint' | 'keySelectNote') {
    const input = h('input', {
      type: 'number', min: 0, max: 127, 'data-testid': testid,
      onchange: () => {
        const n = Number(input.value);
        if (Number.isInteger(n) && n >= 0 && n <= 127) store.update((s) => (s[field] = n));
      },
    });
    const name = h('span', { class: 'note-name' });
    const press = h('button', {
      type: 'button',
      onclick: () => {
        press.textContent = 'waiting…';
        router.captureNextNote((n) => {
          press.textContent = 'press a key';
          store.update((s) => (s[field] = n));
        });
      },
    }, 'press a key');
    return { el: h('label', { class: 'note-field' }, label, input, name, press), input, name, field };
  }
  const noteFields = [
    noteField('Split point', 'split-point', 'splitPoint'),
    noteField('Key-select note', 'key-select', 'keySelectNote'),
  ];

  const rows = CONTROL_TARGETS.map((target) => {
    const binding = h('td', { 'data-testid': `binding-${target}` });
    const mode = createSelect({}, (v) => controls.setMode(target, v as EncoderMode));
    const learn = h('button', { type: 'button', 'data-testid': `learn-${target}`, onclick: () => controls.arm(controls.armedTarget() === target ? null : target) }, 'learn');
    const clear = h('button', { type: 'button', onclick: () => controls.unbind(target) }, 'clear');
    const el = h('tr', {}, h('td', {}, TARGET_INFO[target].label), binding, h('td', {}, mode.el), h('td', {}, learn, clear));
    return { target, el, binding, mode, learn };
  });

  const el = h(
    'aside',
    { class: 'drawer', hidden: true, 'data-testid': 'settings' },
    h('h2', {}, 'Settings'),
    ...noteFields.map((f) => f.el),
    h('h3', {}, 'Control mappings'),
    h('table', { class: 'mappings' }, h('tbody', {}, ...rows.map((r) => r.el))),
  );

  function renderArmed() {
    const armed = controls.armedTarget();
    for (const r of rows) r.learn.classList.toggle('armed', r.target === armed);
  }
  controls.onArmedChange(renderArmed);

  return {
    el,
    toggle() {
      el.hidden = !el.hidden;
    },
    render(s: Settings) {
      for (const f of noteFields) {
        if (document.activeElement !== f.input) f.input.value = String(s[f.field]);
        f.name.textContent = midiNoteName(s[f.field]);
      }
      for (const r of rows) {
        const b = s.bindings.find((x) => x.target === r.target);
        r.binding.textContent = b ? `CC ${b.cc} · ch ${b.channel}` : '—';
        r.mode.setOptions(MODES, b?.mode ?? 'detect');
        r.mode.el.disabled = !b || ['toggle', 'trigger'].includes(TARGET_INFO[r.target].kind);
      }
      renderArmed();
    },
  };
}
