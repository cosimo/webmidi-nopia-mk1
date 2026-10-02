import type { Bus } from '../core/bus';
import { MODULE_IDS, type ControlTarget, type ModuleId, type Settings, type Store } from '../core/store';
import type { ExtLevel } from '../harmony/theory';
import type { ControlMap } from '../input/controlMap';
import type { InputRouter } from '../input/inputRouter';
import type { MidiPorts } from '../input/midiAccess';
import type { Looper } from '../modules/looper';
import { createArpSettings } from './arpSettings';
import { createSelect, h, type Attrs } from './dom';
import { createFaceplate } from './faceplate';
import { createKeyboardView } from './keyboardView';
import { createKnob } from './knob';
import { createLooperControls } from './looperControls';
import { createMidiMonitor } from './midiMonitor';
import { createModules } from './modules';
import { createOled } from './oled';
import { engraved, frost, toggleSwitch } from './parts';
import { createRhythm } from './rhythm';
import { createSettings } from './settings';
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
  looper: Looper;
}

export type BannerKind = 'midi' | 'input' | 'feedback';

const levelOf = (v: number) => Math.min(3, Math.floor(v * 4)) as ExtLevel;

export function mountPanel(root: HTMLElement, deps: PanelDeps) {
  const { store, bus, router, controls } = deps;

  // the strip above the panel: ports and system buttons
  const inputSelect = createSelect({ 'data-testid': 'input-select' }, (v) => store.update((s) => (s.input = v)));
  const outputSelect = createSelect({ 'data-testid': 'output-all' }, (v) => {
    if (v !== '*') store.update((s) => MODULE_IDS.forEach((id) => (s.modules[id].port = v === '' ? null : v)));
  });
  const textButton = (text: string, attrs: Attrs) => h('button', { type: 'button', class: 'text-button', ...attrs }, text);
  const monitor = createMidiMonitor();
  const settings = createSettings({ store, router, controls });
  const learnButton = textButton('Learn', { 'data-testid': 'learn-toggle', onclick: () => setLearning(!learning) });
  const strip = h(
    'header',
    { class: 'strip' },
    h('div', { class: 'wordmark' }, 'nopia', h('span', {}, ' web')),
    h('label', {}, 'MIDI in', inputSelect.el),
    h('label', {}, 'out', outputSelect.el),
    textButton('Monitor', { 'data-testid': 'monitor-toggle', onclick: () => monitor.toggle() }),
    learnButton,
    textButton('Settings', { 'data-testid': 'settings-toggle', onclick: () => settings.toggle() }),
  );
  const banners = h('div', { class: 'banners' });

  // the faceplate
  const flip = (target: ControlTarget, update: (s: Settings) => void) =>
    frost('square', { 'data-testid': target, 'data-learn': target, onclick: () => store.update(update) });
  const layoutButton = flip('layout', (s) => (s.layout = s.layout === 'real' ? 'static' : 'real'));
  const tonalityButton = flip('tonality', (s) => (s.tonality = s.tonality === 'major' ? 'minor' : 'major'));
  const table = toggleSwitch({
    title: 'Secondary dominants / Borrowed',
    'data-testid': 'table',
    'data-learn': 'table',
    onclick: () => store.update((s) => (s.table = s.table === 'secdom' ? 'borrowed' : 'secdom')),
  });
  const modStrip = toggleSwitch({
    title: 'Mod strip: Strum / Vibrato',
    'data-testid': 'mod-strip',
    onclick: () => store.update((s) => (s.modStrip = s.modStrip === 'strum' ? 'vibrato' : 'strum')),
  });
  const stateLabel = (testid: string) => engraved('', { 'data-testid': testid });
  const labels = {
    layout: stateLabel('layout-label'),
    tonality: stateLabel('tonality-label'),
    table: stateLabel('table-label'),
    modStrip: stateLabel('mod-strip-label'),
  };
  const extKnob = createKnob({
    label: 'Extensions',
    size: 'large',
    ticks: 4,
    value: (store.get().extLevel + 0.5) / 4,
    learn: 'extensions',
    onInput: (v) => {
      if (levelOf(v) !== store.get().extLevel) store.update((s) => (s.extLevel = levelOf(v)));
    },
  });
  type MasterKey = keyof Settings['master'];
  const masterKnob = (key: MasterKey, label: string, learn: ControlTarget, size: 'small' | 'medium' | 'dome') => {
    const knob = createKnob({ label, size, learn, value: store.get().master[key], onInput: (v) => store.update((s) => (s.master[key] = v)) });
    return { knob, render: (s: Settings) => Math.abs(knob.value() - s.master[key]) > 1e-6 && knob.set(s.master[key]) };
  };
  const fx = {
    reverb: masterKnob('reverb', 'Reverb', 'reverb', 'medium'),
    master: masterKnob('volume', 'Master volume', 'master', 'dome'),
    tone: masterKnob('tone', 'Tone', 'tone', 'small'),
    delay: masterKnob('delay', 'Delay', 'delay', 'small'),
  };
  const oled = createOled();
  const tonal = createTonalSelector(store);
  const chordKeys = createKeyboardView(router, (s) => [s.splitPoint - 12, s.splitPoint - 1], 'chord-keys');
  const melodyKeys = createKeyboardView(router, (s) => [s.splitPoint, s.splitPoint + 19], 'melody-strip');
  const rhythm = createRhythm(store);
  const looper = createLooperControls(deps.looper);
  const panic = frost('square', { class: 'panic', title: 'Panic', 'data-testid': 'panic', 'data-learn': 'panic', onclick: () => deps.panic() });
  // Key, like holding the key-select note: latched, the next chord key sets the tonic (spec §4.2)
  let keyHeld: number | null = null; // the key-select note the latched button holds
  const keyButton = frost('rect', {
    title: 'Key: then press a chord key to change the tonic',
    'data-testid': 'key-button',
    onclick: () => latchKey(keyHeld === null),
  });
  function latchKey(on: boolean) {
    if (on) {
      keyHeld = store.get().keySelectNote;
      router.noteOn(keyHeld, 100);
    } else if (keyHeld !== null) {
      router.noteOff(keyHeld);
      keyHeld = null;
    }
    keyButton.classList.toggle('lit', keyHeld !== null);
  }
  router.onNote((note, on) => {
    if (on && keyHeld !== null && note !== keyHeld && note < store.get().splitPoint) latchKey(false); // the tonic is set
  });
  const modules = createModules({
    store,
    outputNames: () => deps.ports()?.outputNames() ?? [],
    portMissing: deps.portMissing,
    extras: { arp: createArpSettings(store) },
  });
  const plate = createFaceplate({
    modules: modules.items.map((m) => ({ id: m.id, group: m.group, knob: m.knob.el, label: m.label, popover: m.popover })),
    looper,
    panic,
    layout: layoutButton,
    layoutLabel: labels.layout,
    tonality: tonalityButton,
    tonalityLabel: labels.tonality,
    table: table.el,
    tableLabel: labels.table,
    tempo: rhythm.knob,
    bpm: rhythm.field,
    tap: rhythm.tap,
    click: rhythm.click,
    extensions: extKnob.el,
    modStrip: modStrip.el,
    modStripLabel: labels.modStrip,
    reverb: fx.reverb.knob.el,
    master: fx.master.knob.el,
    tone: fx.tone.knob.el,
    delay: fx.delay.knob.el,
    display: oled.el,
    chordKeys: chordKeys.el,
    keyButton,
    tonics: tonal.buttons,
  });
  const overlay = h(
    'div',
    { class: 'overlay', 'data-testid': 'start-overlay', onclick: () => void deps.startAudio() },
    h('div', {}, 'Click to start audio'),
  );
  root.replaceChildren(strip, banners, h('main', { class: 'stage' }, plate, melodyKeys.el), settings.el, monitor.el, overlay);

  // learn mode: clicking a [data-learn] control arms it instead of using it
  let learning = false;
  function setLearning(on: boolean) {
    learning = on;
    root.classList.toggle('learning', on);
    learnButton.classList.toggle('active', on);
    if (!on) controls.arm(null);
  }
  root.addEventListener(
    'pointerdown',
    (e) => {
      const target = learning && (e.target as Element).closest<HTMLElement>('[data-learn]');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      controls.arm(target.dataset.learn as ControlTarget);
    },
    true,
  );
  root.addEventListener(
    'click',
    (e) => {
      if (learning && (e.target as Element).closest('[data-learn]')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  controls.onArmedChange(() => {
    const armed = controls.armedTarget();
    for (const el of root.querySelectorAll<HTMLElement>('[data-learn]')) {
      el.classList.toggle('armed', el.dataset.learn === armed);
    }
  });

  function render(s: Settings) {
    labels.layout.textContent = s.layout === 'real' ? 'Real' : 'Static';
    layoutButton.classList.toggle('lit', s.layout === 'static');
    labels.tonality.textContent = s.tonality === 'major' ? 'Major' : 'Minor';
    tonalityButton.classList.toggle('lit', s.tonality === 'minor');
    labels.table.textContent = s.table === 'secdom' ? 'Sec. dom' : 'Borrowed';
    table.set(s.table === 'borrowed');
    labels.modStrip.textContent = s.modStrip === 'strum' ? 'Strum' : 'Vibrato';
    modStrip.set(s.modStrip === 'vibrato');
    if (levelOf(extKnob.value()) !== s.extLevel) extKnob.set((s.extLevel + 0.5) / 4);
    for (const k of Object.values(fx)) k.render(s);
    oled.showStatus(s);
    tonal.render(s);
    rhythm.render(s);
    chordKeys.render(s);
    melodyKeys.render(s);
    modules.render(s);
    settings.render(s);
  }
  store.subscribe((s) => render(s));
  render(store.get());

  bus.subscribe((e) => {
    if (e.type === 'chordOn' || e.type === 'chordChange') oled.showChord(e.chord);
    if (e.type === 'chordOff' || e.type === 'panic') oled.showChord(null);
    if (e.type === 'panic') latchKey(false);
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
    logMidi: (data: ArrayLike<number>) => monitor.log(data),
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
      modules.render(s);
    },
  };
}
