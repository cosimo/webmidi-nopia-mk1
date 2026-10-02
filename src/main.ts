import * as Tone from 'tone';
import { Bus } from './core/bus';
import { MODULE_IDS, Store } from './core/store';
import { ChordEngine } from './harmony/chordEngine';
import { ControlMap } from './input/controlMap';
import { InputRouter } from './input/inputRouter';
import { pickInput, requestMidi, type MidiPorts } from './input/midiAccess';
import { BassModule } from './modules/bass';
import { KeysModule } from './modules/keys';
import { MelodyModule } from './modules/melody';
import { PadModule } from './modules/pad';
import { audioToPortTime } from './sound/audioTime';
import { Master } from './sound/master';
import { ModuleOutputs } from './sound/moduleOutputs';
import { createVoice } from './sound/presets';
import { ToneSink } from './sound/toneSink';
import { mountPanel } from './ui/panel';
import './ui/style.css';

const UNSUPPORTED = 'This browser has no Web MIDI. Use Chrome or Edge — the on-screen keyboard still works.';
const DENIED =
  'MIDI access was blocked. Click the site-settings icon left of the address, allow “MIDI devices”, then reload.';

Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = new Store(browserStorage());
const bus = new Bus();
const engine = new ChordEngine(() => store.get(), (e) => bus.emit(e));
const master = new Master();
let midi: MidiPorts | null = null;
const outputs = new ModuleOutputs({
  internal: (id, preset) =>
    new ToneSink(createVoice(preset), id === 'keys' || id === 'pad' || id === 'arp' ? master.toneInput : master.input, id === 'melody'),
  midiPort: (name) => midi?.output(name) ?? null,
  portTime: audioToPortTime,
});
const modules = [
  new KeysModule(outputs.sink('keys')),
  new PadModule(outputs.sink('pad')),
  new BassModule(outputs.sink('bass')),
  new MelodyModule(outputs.sink('melody'), () => store.get().modStrip),
];
bus.subscribe((e) => {
  for (const m of modules) m.handle(e);
});

function panic(): void {
  bus.emit({ type: 'panic' });
  engine.reset();
  router.reset();
}

const controls = new ControlMap(store, { panic });
const router = new InputRouter({ engine, bus, store, controls });

const HARMONY_KEYS = ['tonic', 'tonality', 'layout', 'table', 'extLevel'] as const;
store.subscribe((next, prev) => {
  if (HARMONY_KEYS.some((k) => next[k] !== prev[k])) engine.settingsChanged();
  outputs.sync(next);
  master.apply(next.master);
});
outputs.sync(store.get());
master.apply(store.get().master);

const ui = mountPanel(document.querySelector<HTMLElement>('#app')!, {
  store,
  bus,
  router,
  controls,
  ports: () => midi,
  portMissing: (id) => outputs.portMissing(id),
  panic,
  startAudio: () => Tone.start(),
});

const context = Tone.getContext();
ui.setAudioRunning(context.state === 'running');
context.on('statechange', () => ui.setAudioRunning(context.state === 'running'));

document.addEventListener('visibilitychange', () => {
  if (document.hidden) panic();
});

void requestMidi(navigator).then((result) => {
  if ('error' in result) {
    ui.setBanner('midi', result.error === 'unsupported' ? UNSUPPORTED : DENIED);
    return;
  }
  const ports = result.ports;
  midi = ports;
  ports.onMessage((data) => {
    router.handleMidi(data);
    ui.logMidi(data);
  });
  const refresh = () => {
    const before = ports.currentInput();
    ports.useInput(pickInput(ports.inputNames(), store.get().input));
    // the old input's note-offs will never arrive, whether it is gone or replaced by another
    if (before !== null && ports.currentInput() !== before) panic();
    outputs.sync(store.get());
    ui.refreshPorts();
  };
  ports.onChange(refresh);
  store.subscribe((next, prev) => {
    if (next.input !== prev.input || MODULE_IDS.some((id) => next.modules[id].port !== prev.modules[id].port)) refresh();
  });
  refresh();
});
