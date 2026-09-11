export const SUITE_PROTOTYPE_ACK_KEY = 'skyjet.suite.prototype-ack';

export const SUITE_PROTOTYPE_TITLE = 'Skyjet Business Suite';

export const SUITE_PROTOTYPE_BODY =
  'A bookkeeping prototype still in test. Not live until management approves.';

export function hasAcknowledgedSuitePrototype(): boolean {
  try {
    return sessionStorage.getItem(SUITE_PROTOTYPE_ACK_KEY) === '1';
  } catch {
    return false;
  }
}

export function acknowledgeSuitePrototype(): void {
  try {
    sessionStorage.setItem(SUITE_PROTOTYPE_ACK_KEY, '1');
  } catch {
    /* private mode */
  }
}
