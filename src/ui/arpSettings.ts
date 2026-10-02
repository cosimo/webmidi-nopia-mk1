import { ARP_PATTERNS, ARP_RATES, type ArpPattern, type ArpRate, type ArpSettings, type Settings, type Store } from '../core/store';
import { createSelect, h } from './dom';

const PATTERN_LABELS: Record<ArpPattern, string> = { up: 'up', down: 'down', upDown: 'up-down', random: 'random' };
const GATES = Array.from({ length: 10 }, (_, i) => (i + 1) / 10); // 10% … 100%

/** The Arp's pattern, rate, octaves and gate, shown in its module settings (spec §5.5). */
export function createArpSettings(store: Store) {
  const set = (patch: Partial<ArpSettings>) => store.update((s) => Object.assign(s.arp, patch));
  const pattern = createSelect({ 'data-testid': 'arp-pattern' }, (v) => set({ pattern: v as ArpPattern }));
  const rate = createSelect({ 'data-testid': 'arp-rate' }, (v) => set({ rate: v as ArpRate }));
  const octaves = createSelect({ 'data-testid': 'arp-octaves' }, (v) => set({ octaves: Number(v) as 1 | 2 | 3 }));
  const gate = createSelect({ 'data-testid': 'arp-gate' }, (v) => set({ gate: Number(v) }));
  const el = h(
    'div',
    { class: 'arp-settings' },
    h('label', {}, 'pattern ', pattern.el),
    h('label', { 'data-learn': 'arpRate' }, 'rate ', rate.el),
    h('label', {}, 'octaves ', octaves.el),
    h('label', {}, 'gate ', gate.el),
  );
  return {
    el,
    render(s: Settings) {
      pattern.setOptions(ARP_PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] })), s.arp.pattern);
      rate.setOptions(ARP_RATES.map((r) => ({ value: r, label: r })), s.arp.rate);
      octaves.setOptions([1, 2, 3].map((o) => ({ value: String(o), label: String(o) })), String(s.arp.octaves));
      gate.setOptions(GATES.map((g) => ({ value: String(g), label: `${Math.round(g * 100)}%` })), String(s.arp.gate));
    },
  };
}
