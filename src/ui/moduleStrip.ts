import { MODULE_IDS, PRESET_CHOICES, type ModuleId, type ModuleSettings, type Settings, type Store } from '../core/store';
import { createSelect, h } from './dom';
import { createKnob } from './knob';

const NAMES: Record<ModuleId, string> = { keys: 'Keys', pad: 'Pad', bass: 'Bass', melody: 'Melody' };
const CHANNELS = Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: `ch ${i + 1}` }));

/** A volume knob per module; the module name opens its settings. */
export function createModuleStrip(deps: {
  store: Store;
  outputNames: () => string[];
  portMissing: (id: ModuleId) => boolean;
}) {
  const { store } = deps;
  const set = (id: ModuleId, patch: Partial<ModuleSettings>) =>
    store.update((s) => Object.assign(s.modules[id], patch));

  const items = MODULE_IDS.map((id) => {
    const knob = createKnob({ label: 'vol', value: store.get().modules[id].volume, learn: `vol.${id}`, onInput: (v) => set(id, { volume: v }) });
    const enabled = h('input', { type: 'checkbox', 'data-testid': `${id}-enabled`, onchange: () => set(id, { enabled: enabled.checked }) });
    const sound = h('input', { type: 'checkbox', 'data-testid': `${id}-sound`, onchange: () => set(id, { sound: sound.checked }) });
    const preset = createSelect({ 'data-testid': `${id}-preset` }, (v) => set(id, { preset: v }));
    const port = createSelect({ 'data-testid': `${id}-port` }, (v) => set(id, { port: v === '' ? null : v }));
    const channel = createSelect({ 'data-testid': `${id}-channel` }, (v) => set(id, { channel: Number(v) }));
    const badge = h('span', { class: 'badge', title: 'MIDI port missing — using internal sound', hidden: true }, '⚠');
    const details = h(
      'details',
      { class: 'module-settings' },
      h('summary', { 'data-testid': `${id}-open` }, NAMES[id], badge),
      h('label', {}, enabled, ' enabled'),
      h('label', {}, sound, ' internal sound'),
      h('label', {}, 'preset ', preset.el),
      h('label', {}, 'MIDI out ', port.el),
      h('label', {}, 'channel ', channel.el),
    );
    const el = h('div', { class: 'module', 'data-testid': `module-${id}` }, knob.el, details);
    return { id, el, knob, enabled, sound, preset, port, channel, badge };
  });

  return {
    el: h('div', { class: 'module-strip' }, ...items.map((i) => i.el)),
    render(s: Settings) {
      const outs = deps.outputNames();
      for (const it of items) {
        const m = s.modules[it.id];
        if (Math.abs(it.knob.value() - m.volume) > 1e-6) it.knob.set(m.volume);
        it.enabled.checked = m.enabled;
        it.sound.checked = m.sound;
        it.el.classList.toggle('disabled', !m.enabled);
        it.preset.setOptions(PRESET_CHOICES[it.id].map((p) => ({ value: p.id, label: p.label })), m.preset);
        const names = m.port !== null && !outs.includes(m.port) ? [...outs, m.port] : outs;
        it.port.setOptions(
          [{ value: '', label: '— none —' }, ...names.map((n) => ({ value: n, label: outs.includes(n) ? n : `${n} (missing)` }))],
          m.port ?? '',
        );
        it.channel.setOptions(CHANNELS, String(m.channel));
        it.badge.hidden = !deps.portMissing(it.id);
      }
    },
  };
}
