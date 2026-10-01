import { describe, expect, it } from 'vitest';
import { Bus, type BusEvent } from './bus';

describe('Bus', () => {
  it('timestamps events and delivers them to every subscriber', () => {
    const bus = new Bus(() => 42);
    const a: BusEvent[] = [];
    const b: BusEvent[] = [];
    bus.subscribe((e) => a.push(e));
    bus.subscribe((e) => b.push(e));
    bus.emit({ type: 'melodyOn', note: 60, velocity: 100 });
    expect(a).toEqual([{ type: 'melodyOn', note: 60, velocity: 100, time: 42 }]);
    expect(b).toEqual(a);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = new Bus(() => 0);
    const got: BusEvent[] = [];
    const off = bus.subscribe((e) => got.push(e));
    off();
    bus.emit({ type: 'panic' });
    expect(got).toEqual([]);
  });
});
