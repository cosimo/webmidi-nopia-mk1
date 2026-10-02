import type { ExtLevel } from '../harmony/theory';
import { MODULE_IDS, type ModuleId, type Settings } from './store';

/**
 * Settings the looper records and replays (spec §5.7). Tonic, tonality, layout and table are left
 * out so that loops follow later changes to them; tempo is left out because loops are in bars.
 */
export type ParamKey = 'extLevel' | `vol.${ModuleId}` | 'tone' | 'reverb' | 'delay' | 'master';

export const PARAM_KEYS: ParamKey[] = [
  'extLevel',
  ...MODULE_IDS.map((id) => `vol.${id}` as const),
  'tone', 'reverb', 'delay', 'master',
];

export interface Param {
  key: ParamKey;
  value: number;
}

export function readParam(s: Settings, key: ParamKey): number {
  if (key === 'extLevel') return s.extLevel;
  if (key === 'master') return s.master.volume;
  if (key.startsWith('vol.')) return s.modules[key.slice(4) as ModuleId].volume;
  return s.master[key as 'tone' | 'reverb' | 'delay'];
}

export function writeParam(s: Settings, { key, value }: Param): void {
  if (key === 'extLevel') s.extLevel = value as ExtLevel;
  else if (key === 'master') s.master.volume = value;
  else if (key.startsWith('vol.')) s.modules[key.slice(4) as ModuleId].volume = value;
  else s.master[key as 'tone' | 'reverb' | 'delay'] = value;
}

/** The recordable parameters whose values differ between two settings. */
export function paramChanges(prev: Settings, next: Settings): Param[] {
  return PARAM_KEYS.filter((key) => readParam(prev, key) !== readParam(next, key)).map((key) => ({
    key,
    value: readParam(next, key),
  }));
}
