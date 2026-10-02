import { clampTempo, TEMPO_MAX, TEMPO_MIN } from '../core/clock';
import {
  ARP_RATES,
  type Binding,
  type ControlTarget,
  type EncoderMode,
  type ModuleId,
  type Settings,
  type Store,
} from '../core/store';
import type { ExtLevel } from '../harmony/theory';

type TargetKind = 'continuous' | 'stepped' | 'toggle' | 'trigger';

export const TARGET_INFO: Record<ControlTarget, { label: string; kind: TargetKind }> = {
  extensions: { label: 'Extensions', kind: 'stepped' },
  layout: { label: 'Real/Static', kind: 'toggle' },
  tonality: { label: 'Major/Minor', kind: 'toggle' },
  table: { label: 'Table', kind: 'toggle' },
  'vol.keys': { label: 'Keys volume', kind: 'continuous' },
  'vol.pad': { label: 'Pad volume', kind: 'continuous' },
  'vol.bass': { label: 'Bass volume', kind: 'continuous' },
  'vol.melody': { label: 'Melody volume', kind: 'continuous' },
  'vol.arp': { label: 'Arp volume', kind: 'continuous' },
  'vol.strum': { label: 'Strum volume', kind: 'continuous' },
  tone: { label: 'Tone', kind: 'continuous' },
  reverb: { label: 'Reverb send', kind: 'continuous' },
  delay: { label: 'Delay send', kind: 'continuous' },
  master: { label: 'Master volume', kind: 'continuous' },
  tempo: { label: 'Tempo', kind: 'continuous' },
  arpRate: { label: 'Arp rate', kind: 'stepped' },
  panic: { label: 'Panic', kind: 'trigger' },
};

/** Values received before a 'detect' binding is declared relative. */
export const DETECT_SAMPLES = 8;
/** Relative-encoder ticks per step of a stepped target (Extensions, Arp rate). */
export const TICKS_PER_STEP = 8;

const TEMPO_SPAN = TEMPO_MAX - TEMPO_MIN;

const inRelativeRange = (v: number) => (v >= 1 && v <= 10) || (v >= 118 && v <= 127);
const relativeDelta = (v: number) => (v < 64 ? v : v - 128);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** How far one relative-encoder tick moves a continuous target, on its 0..1 scale: Tempo moves 1 BPM. */
const relativeStep = (target: ControlTarget) => (target === 'tempo' ? 1 / TEMPO_SPAN : 1 / 127);

function getUnit(s: Settings, target: ControlTarget): number {
  if (target.startsWith('vol.')) return s.modules[target.slice(4) as ModuleId].volume;
  if (target === 'master') return s.master.volume;
  if (target === 'tempo') return (s.tempo - TEMPO_MIN) / TEMPO_SPAN;
  return s.master[target as 'tone' | 'reverb' | 'delay'];
}

function setUnit(s: Settings, target: ControlTarget, v: number): void {
  if (target.startsWith('vol.')) s.modules[target.slice(4) as ModuleId].volume = v;
  else if (target === 'master') s.master.volume = v;
  else if (target === 'tempo') s.tempo = clampTempo(TEMPO_MIN + v * TEMPO_SPAN);
  else s.master[target as 'tone' | 'reverb' | 'delay'] = v;
}

interface Stepped {
  count: number;
  get(s: Settings): number;
  set(s: Settings, step: number): void;
}

const STEPPED: Partial<Record<ControlTarget, Stepped>> = {
  extensions: { count: 4, get: (s) => s.extLevel, set: (s, i) => (s.extLevel = i as ExtLevel) },
  arpRate: {
    count: ARP_RATES.length,
    get: (s) => ARP_RATES.indexOf(s.arp.rate),
    set: (s, i) => (s.arp.rate = ARP_RATES[i]),
  },
};

function toggle(s: Settings, target: ControlTarget): void {
  if (target === 'layout') s.layout = s.layout === 'real' ? 'static' : 'real';
  if (target === 'tonality') s.tonality = s.tonality === 'major' ? 'minor' : 'major';
  if (target === 'table') s.table = s.table === 'secdom' ? 'borrowed' : 'secdom';
}

const key = (channel: number, cc: number) => `${channel}:${cc}`;

/** MIDI learn and CC → settings mapping (spec §4.3). */
export class ControlMap {
  private armed: ControlTarget | null = null;
  private samples = new Map<string, number>();
  private stepTicks = new Map<ControlTarget, number>();
  private listeners: (() => void)[] = [];

  constructor(
    private store: Store,
    private actions: { panic(): void },
  ) {}

  /** Arm a target for learning; the next CC received binds to it. null disarms. */
  arm(target: ControlTarget | null): void {
    this.armed = target;
    this.notify();
  }

  armedTarget(): ControlTarget | null {
    return this.armed;
  }

  onArmedChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  setMode(target: ControlTarget, mode: EncoderMode): void {
    this.store.update((s) => {
      const b = s.bindings.find((x) => x.target === target);
      if (b) b.mode = mode;
    });
  }

  unbind(target: ControlTarget): void {
    this.store.update((s) => {
      s.bindings = s.bindings.filter((b) => b.target !== target);
    });
  }

  /** Returns true when the CC was consumed (learned or bound). Channel is 1..16. */
  handleCC(channel: number, cc: number, value: number): boolean {
    if (this.armed) {
      const target = this.armed;
      this.store.update((s) => {
        s.bindings = s.bindings.filter((b) => b.target !== target && key(b.channel, b.cc) !== key(channel, cc));
        s.bindings.push({ target, channel, cc, mode: 'detect' });
      });
      this.samples.delete(key(channel, cc));
      this.arm(null);
      return true;
    }
    const binding = this.store.get().bindings.find((b) => b.channel === channel && b.cc === cc);
    if (!binding) return false;
    this.apply(binding, value);
    return true;
  }

  private apply(binding: Binding, value: number): void {
    const { target } = binding;
    const { kind } = TARGET_INFO[target];
    if (kind === 'trigger') {
      if (value > 63) this.actions.panic();
      return;
    }
    if (kind === 'toggle') {
      if (value > 63) this.store.update((s) => toggle(s, target));
      return;
    }
    const mode = binding.mode === 'detect' ? this.detect(binding, value) : binding.mode;
    if (kind === 'stepped') {
      this.applyStepped(target, mode, value);
      return;
    }
    const v = mode === 'absolute'
      ? value / 127
      : clamp01(getUnit(this.store.get(), target) + relativeDelta(value) * relativeStep(target));
    this.store.update((s) => setUnit(s, target, v));
  }

  /** Decide a 'detect' binding's mode; values that could be relative are applied as relative meanwhile. */
  private detect(binding: Binding, value: number): 'absolute' | 'relative' {
    const k = key(binding.channel, binding.cc);
    if (!inRelativeRange(value)) {
      this.setMode(binding.target, 'absolute');
      return 'absolute';
    }
    const n = (this.samples.get(k) ?? 0) + 1;
    this.samples.set(k, n);
    if (n >= DETECT_SAMPLES) this.setMode(binding.target, 'relative');
    return 'relative';
  }

  private applyStepped(target: ControlTarget, mode: 'absolute' | 'relative', value: number): void {
    const { count, get, set } = STEPPED[target]!;
    const current = get(this.store.get());
    let step = current;
    if (mode === 'absolute') {
      step = Math.min(count - 1, Math.floor((value * count) / 128));
    } else {
      let ticks = (this.stepTicks.get(target) ?? 0) + relativeDelta(value);
      while (ticks >= TICKS_PER_STEP) { step++; ticks -= TICKS_PER_STEP; }
      while (ticks <= -TICKS_PER_STEP) { step--; ticks += TICKS_PER_STEP; }
      step = Math.min(count - 1, Math.max(0, step));
      // at an end stop, ticks pushing further are dropped so the first turn back steps at once
      if ((step === count - 1 && ticks > 0) || (step === 0 && ticks < 0)) ticks = 0;
      this.stepTicks.set(target, ticks);
    }
    if (step !== current) this.store.update((s) => set(s, step));
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
