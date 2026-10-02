import type { ExtLevel, HarmonySettings, LayoutMode, TableId, Tonality } from '../harmony/theory';
import { TEMPO_DEFAULT, TEMPO_MAX, TEMPO_MIN } from './clock';

export type ModuleId = 'keys' | 'pad' | 'bass' | 'melody' | 'arp' | 'strum';
export const MODULE_IDS: ModuleId[] = ['keys', 'pad', 'bass', 'melody', 'arp', 'strum'];

/** Presets each module offers; sound/presets.ts implements them. */
export const PRESET_CHOICES: Record<ModuleId, { id: string; label: string }[]> = {
  keys: [
    { id: 'epiano', label: 'E-piano' },
    { id: 'organ', label: 'Organ' },
    { id: 'pluck', label: 'Pluck' },
  ],
  pad: [
    { id: 'warmPad', label: 'Warm saw pad' },
    { id: 'glass', label: 'Glass' },
  ],
  bass: [
    { id: 'sub', label: 'Sub' },
    { id: 'sawBass', label: 'Saw bass' },
  ],
  melody: [
    { id: 'lead', label: 'Lead' },
    { id: 'leadGlide', label: 'Lead (glide)' },
  ],
  arp: [
    { id: 'pluck', label: 'Pluck' },
    { id: 'bell', label: 'Bell' },
  ],
  strum: [
    { id: 'harp', label: 'Harp' },
    { id: 'pluck', label: 'Pluck' },
  ],
};

export type ControlTarget =
  | 'extensions'
  | 'layout'
  | 'tonality'
  | 'table'
  | 'vol.keys'
  | 'vol.pad'
  | 'vol.bass'
  | 'vol.melody'
  | 'vol.arp'
  | 'vol.strum'
  | 'tone'
  | 'reverb'
  | 'delay'
  | 'master'
  | 'panic';

export const CONTROL_TARGETS: ControlTarget[] = [
  'extensions', 'layout', 'tonality', 'table',
  'vol.keys', 'vol.pad', 'vol.bass', 'vol.melody', 'vol.arp', 'vol.strum',
  'tone', 'reverb', 'delay', 'master', 'panic',
];

export type EncoderMode = 'detect' | 'absolute' | 'relative';

export interface Binding {
  target: ControlTarget;
  channel: number; // 1..16
  cc: number; // 0..127
  mode: EncoderMode;
}

export interface ModuleSettings {
  enabled: boolean;
  volume: number; // 0..1
  sound: boolean; // internal sound on/off
  preset: string;
  port: string | null; // MIDI output name, null = no MIDI out
  channel: number; // 1..16
}

export interface MasterSettings {
  volume: number; // all 0..1
  reverb: number;
  delay: number;
  tone: number;
}

export type ArpPattern = 'up' | 'down' | 'upDown' | 'random';
export const ARP_PATTERNS: ArpPattern[] = ['up', 'down', 'upDown', 'random'];
export type ArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T';
/** Slow to fast. */
export const ARP_RATES: ArpRate[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T'];

export interface ArpSettings {
  pattern: ArpPattern;
  rate: ArpRate;
  octaves: 1 | 2 | 3;
  gate: number; // 0.1..1, fraction of a step
}

export type ModStripFunction = 'vibrato' | 'strum';

export interface Settings extends HarmonySettings {
  splitPoint: number;
  keySelectNote: number;
  bindings: Binding[];
  modules: Record<ModuleId, ModuleSettings>;
  master: MasterSettings;
  input: string | null; // MIDI input name
  tempo: number; // whole BPM, 40..240
  metronome: boolean;
  modStrip: ModStripFunction;
  arp: ArpSettings;
}

export const STORAGE_KEY = 'nopia-web.settings.v2';

export function defaultSettings(): Settings {
  const mod = (preset: string, channel: number, volume: number): ModuleSettings => ({
    enabled: true, volume, sound: true, preset, port: null, channel,
  });
  const bind = (cc: number, target: ControlTarget): Binding => ({ target, channel: 1, cc, mode: 'detect' });
  return {
    tonic: 0,
    tonality: 'major',
    layout: 'real',
    table: 'secdom',
    extLevel: 0,
    splitPoint: 60,
    keySelectNote: 79,
    bindings: [
      bind(14, 'extensions'), bind(15, 'vol.keys'), bind(16, 'vol.pad'), bind(17, 'vol.bass'),
      bind(18, 'vol.melody'), bind(19, 'tone'), bind(20, 'reverb'), bind(21, 'master'),
    ],
    modules: {
      keys: mod('epiano', 1, 0.8),
      pad: mod('warmPad', 4, 0.5),
      bass: mod('sub', 2, 0.7),
      melody: mod('lead', 5, 0.8),
      arp: { ...mod('pluck', 3, 0.6), enabled: false }, // would double every chord on first launch
      strum: mod('harp', 6, 0.7),
    },
    master: { volume: 0.8, reverb: 0.25, delay: 0.1, tone: 0.8 },
    input: null,
    tempo: TEMPO_DEFAULT,
    metronome: false,
    modStrip: 'strum',
    arp: { pattern: 'up', rate: '1/8', octaves: 1, gate: 0.5 },
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): boolean =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isUnit = (v: unknown): boolean => typeof v === 'number' && v >= 0 && v <= 1;
const isOneOf = (v: unknown, options: readonly unknown[]): boolean => options.includes(v);
const isNameOrNull = (v: unknown): boolean => v === null || typeof v === 'string';

function isBinding(v: unknown): boolean {
  return isObj(v) && isOneOf(v.target, CONTROL_TARGETS) && isInt(v.channel, 1, 16) &&
    isInt(v.cc, 0, 127) && isOneOf(v.mode, ['detect', 'absolute', 'relative']);
}

function isModule(id: ModuleId, v: unknown): boolean {
  return isObj(v) && typeof v.enabled === 'boolean' && isUnit(v.volume) && typeof v.sound === 'boolean' &&
    isOneOf(v.preset, PRESET_CHOICES[id].map((p) => p.id)) && isNameOrNull(v.port) && isInt(v.channel, 1, 16);
}

function isArp(v: unknown): boolean {
  return isObj(v) && isOneOf(v.pattern, ARP_PATTERNS) && isOneOf(v.rate, ARP_RATES) &&
    isOneOf(v.octaves, [1, 2, 3]) && typeof v.gate === 'number' && v.gate >= 0.1 && v.gate <= 1;
}

export function isValidSettings(v: unknown): v is Settings {
  if (!isObj(v)) return false;
  const { modules, master } = v;
  return isInt(v.tonic, 0, 11) &&
    isOneOf(v.tonality, ['major', 'minor'] satisfies Tonality[]) &&
    isOneOf(v.layout, ['real', 'static'] satisfies LayoutMode[]) &&
    isOneOf(v.table, ['secdom', 'borrowed'] satisfies TableId[]) &&
    isOneOf(v.extLevel, [0, 1, 2, 3] satisfies ExtLevel[]) &&
    isInt(v.splitPoint, 0, 127) &&
    isInt(v.keySelectNote, 0, 127) &&
    Array.isArray(v.bindings) && v.bindings.every(isBinding) &&
    isObj(modules) && MODULE_IDS.every((id) => isModule(id, modules[id])) &&
    isObj(master) && isUnit(master.volume) && isUnit(master.reverb) && isUnit(master.delay) && isUnit(master.tone) &&
    isNameOrNull(v.input) &&
    isInt(v.tempo, TEMPO_MIN, TEMPO_MAX) &&
    typeof v.metronome === 'boolean' &&
    isOneOf(v.modStrip, ['vibrato', 'strum'] satisfies ModStripFunction[]) &&
    isArp(v.arp);
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;
type StoreListener = (next: Settings, prev: Settings) => void;

export class Store {
  private settings: Settings;
  private listeners: StoreListener[] = [];

  constructor(private storage: KeyValueStorage | null) {
    this.settings = this.load();
  }

  get(): Readonly<Settings> {
    return this.settings;
  }

  /** Apply `mutate` to a copy of the settings, persist it and notify subscribers. */
  update(mutate: (draft: Settings) => void): void {
    const prev = this.settings;
    const next = structuredClone(prev);
    mutate(next);
    this.settings = next;
    this.save();
    for (const l of [...this.listeners]) l(next, prev);
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private load(): Settings {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidSettings(parsed)) return parsed;
      }
    } catch {
      // unreadable storage or corrupt JSON: fall through to defaults
    }
    return defaultSettings();
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // storage full or blocked: settings still work for this session
    }
  }
}
