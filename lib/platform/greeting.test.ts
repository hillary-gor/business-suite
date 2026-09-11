import { describe, expect, it } from 'vitest';
import { greetingForHour } from './greeting';

describe('greetingForHour', () => {
  it('splits the day into morning, afternoon and evening', () => {
    expect(greetingForHour(0)).toBe('Good morning');
    expect(greetingForHour(11)).toBe('Good morning');
    expect(greetingForHour(12)).toBe('Good afternoon');
    expect(greetingForHour(16)).toBe('Good afternoon');
    expect(greetingForHour(17)).toBe('Good evening');
    expect(greetingForHour(23)).toBe('Good evening');
  });
});
