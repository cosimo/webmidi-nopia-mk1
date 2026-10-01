import { describe, expect, it } from 'vitest';
import { describeMidi } from './midiMonitor';

describe('describeMidi', () => {
  it('describes notes with channel, number and name', () => {
    expect(describeMidi([0x90, 60, 100])).toBe('Note on    ch1  60 C4  vel 100');
    expect(describeMidi([0x91, 60, 0])).toBe('Note off   ch2  60 C4');
    expect(describeMidi([0x80, 48, 0])).toBe('Note off   ch1  48 C3');
  });

  it('describes CCs and pitch bend', () => {
    expect(describeMidi([0xb0, 14, 65])).toBe('CC         ch1  #14 = 65');
    expect(describeMidi([0xe0, 0, 64])).toBe('Pitch bend ch1  8192');
  });

  it('hides clock and active sensing', () => {
    expect(describeMidi([0xf8])).toBeNull();
    expect(describeMidi([0xfe])).toBeNull();
  });
});
