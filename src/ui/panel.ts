import type { Bus } from '../core/bus';
import { MODULE_IDS, type ControlTarget, type ModuleId, type Settings, type Store } from '../core/store';
import type { ExtLevel } from '../harmony/theory';
import type { ControlMap } from '../input/controlMap';
import type { InputRouter } from '../input/inputRouter';
import type { MidiPorts } from '../input/midiAccess';
import { createSelect, h } from './dom';
import { createKeyboardView } from './keyboardView';
import { createKnob } from './knob';
import { createModuleStrip } from './moduleStrip';
import { createOled } from './oled';
import { createTonalSelector } from './tonalSelector';

export interface PanelDeps {
  store: Store;
  bus: Bus;
  router: InputRouter;
  controls: ControlMap;
  ports: () => MidiPorts | null;
  portMissing: (id: ModuleId) => boolean;
  panic: () => void;
  startAudio: () => Promise<void>;
}

export type BannerKind = 'midi' | 'input' | 'feedback';

const levelOf = (v: number) => Math.min(3, Math.floor(v * 4)) as ExtLevel;

export function mountPanel(root: HTMLElement, deps: PanelDeps) {
  const { store, bus, router } = deps;

  // header
  const inputSelect = createSelect({ 'data-testid': 'input-select' }, (v) => store.update((s) => (s.input = v)));
  const outputSelect = createSelect({ 'data-testid': 'output-all' }, (v) => {
    if (v !== '*') store.update((s) => MODULE_IDS.forEach((id) => (s.modules[id].port = v === '' ? null : v)));
  });
  const header = h(
    'header',
    { class: 'header' },
    h('h1', {}, 'nopia', h('span', {}, ' web')),
    h('label', {}, 'MIDI in ', inputSelect.el),
    h('label', {}, 'MIDI out (all) ', outputSelect.el),
    h('button', { class: 'panic', 'data-learn': 'panic', 'data-testid': 'panic', onclick: () => deps.panic() }, 'Panic'),
  );
  const banners = h('div', { class: 'banners' });

  // panel
  const toggleButton = (target: ControlTarget, flip: (s: Settings) => void) =>
    h('button', { class: 'toggle', 'data-learn': target, 'data-testid': target, onclick: () => store.update(flip) });
  const layoutButton = toggleButton('layout', (s) => (s.layout = s.layout === 'real' ? 'static' : 'real'));
  const tonalityButton = toggleButton('tonality', (s) => (s.tonality = s.tonality === 'major' ? 'minor' : 'major'));
  const tableButton = toggleButton('table', (s) => (s.table = s.table === 'secdom' ? 'borrowed' : 'secdom'));
  const extKnob = createKnob({
    label: 'Extensions',
    value: (store.get().extLevel + 0.5) / 4,
    learn: 'extensions',
    large: true,
    onInput: (v) => {
      if (levelOf(v) !== store.get().extLevel) store.update((s) => (s.extLevel = levelOf(v)));
    },
  });
  const oled = createOled();
  const tonal = createTonalSelector(store);
  const keyboard = createKeyboardView(router);
  const strip = createModuleStrip({
    store,
    outputNames: () => deps.ports()?.outputNames() ?? [],
    portMissing: deps.portMissing,
  });
  const panel = h(
    'main',
    { class: 'panel' },
    h('div', { class: 'controls' }, layoutButton, tonalityButton, tableButton, extKnob.el),
    oled.el,
    tonal.el,
    keyboard.el,
    strip.el,
  );
  const overlay = h(
    'div',
    { class: 'overlay', 'data-testid': 'start-overlay', onclick: () => void deps.startAudio() },
    h('div', {}, 'Click to start audio'),
  );
  root.replaceChildren(header, banners, panel, overlay);

  function render(s: Settings) {
    layoutButton.textContent = s.layout === 'real' ? 'Real' : 'Static';
    tonalityButton.textContent = s.tonality === 'major' ? 'Major' : 'Minor';
    tableButton.textContent = s.table === 'secdom' ? 'Sec. dominants' : 'Borrowed';
    if (levelOf(extKnob.value()) !== s.extLevel) extKnob.set((s.extLevel + 0.5) / 4);
    oled.showStatus(s);
    tonal.render(s);
    keyboard.render(s);
    strip.render(s);
  }
  store.subscribe((s) => render(s));
  render(store.get());

  bus.subscribe((e) => {
    if (e.type === 'chordOn' || e.type === 'chordChange') oled.showChord(e.chord);
    if (e.type === 'chordOff' || e.type === 'panic') oled.showChord(null);
  });

  const bannerEls = new Map<BannerKind, HTMLElement>();
  function setBanner(kind: BannerKind, text: string | null) {
    bannerEls.get(kind)?.remove();
    bannerEls.delete(kind);
    if (text === null) return;
    const el = h('div', { class: `banner ${kind}`, role: 'alert', 'data-testid': `banner-${kind}` }, text);
    bannerEls.set(kind, el);
    banners.append(el);
  }

  return {
    setBanner,
    setAudioRunning: (running: boolean) => void (overlay.hidden = running),
    /** Re-read port lists after hot-plug or a port/input selection change. */
    refreshPorts() {
      const ports = deps.ports();
      if (!ports) return;
      const s = store.get();
      const ins = ports.inputNames();
      const current = ports.currentInput();
      const inputOptions = ins.map((n) => ({ value: n, label: n }));
      if (s.input !== null && !ins.includes(s.input)) inputOptions.push({ value: s.input, label: `${s.input} (missing)` });
      if (inputOptions.length === 0) inputOptions.push({ value: '', label: 'no MIDI inputs' });
      inputSelect.setOptions(inputOptions, current ?? s.input ?? '');

      setBanner('input', current === null ? 'Connect a keyboard — no MIDI input is connected.' : null);

      const outs = ports.outputNames();
      const chosen = new Set(MODULE_IDS.map((id) => s.modules[id].port ?? ''));
      const outOptions = [{ value: '', label: '— none —' }, ...outs.map((n) => ({ value: n, label: n }))];
      if (chosen.size > 1) outOptions.unshift({ value: '*', label: '(per module)' });
      outputSelect.setOptions(outOptions, chosen.size > 1 ? '*' : [...chosen][0]);
      const loop = current !== null && MODULE_IDS.some((id) => s.modules[id].port === current);
      setBanner('feedback', loop ? `“${current}” is both the MIDI input and a module output — this can cause a feedback loop.` : null);
      strip.render(s);
    },
  };
}
