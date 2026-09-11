import { afterEach, describe, expect, it } from 'vitest';
import {
  SUITE_PROTOTYPE_ACK_KEY,
  SUITE_PROTOTYPE_BODY,
  SUITE_PROTOTYPE_TITLE,
  acknowledgeSuitePrototype,
  hasAcknowledgedSuitePrototype,
} from '@/lib/suite-prototype';

describe('suite prototype notice', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
  });

  it('keeps the copy short', () => {
    expect(SUITE_PROTOTYPE_TITLE).toBe('Skyjet Business Suite');
    expect(SUITE_PROTOTYPE_BODY.length).toBeLessThan(120);
    expect(SUITE_PROTOTYPE_BODY).toMatch(/prototype/i);
    expect(SUITE_PROTOTYPE_BODY).toMatch(/management/i);
  });

  it('remembers acknowledgement for this tab', () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    expect(hasAcknowledgedSuitePrototype()).toBe(false);
    acknowledgeSuitePrototype();
    expect(store.get(SUITE_PROTOTYPE_ACK_KEY)).toBe('1');
    expect(hasAcknowledgedSuitePrototype()).toBe(true);
  });
});
