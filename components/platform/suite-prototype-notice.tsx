'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SUITE_PROTOTYPE_BODY, SUITE_PROTOTYPE_TITLE } from '@/lib/suite-prototype';

export function SuitePrototypeNotice({ onProceed }: { onProceed: () => void }) {
  const titleId = useId();
  const bodyId = useId();
  const proceedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    proceedRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onProceed();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onProceed]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="notice-dialog-root">
      <div className="notice-dialog__backdrop" />
      <div
        className="notice-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h2 id={titleId} className="notice-dialog__title">
          {SUITE_PROTOTYPE_TITLE}
        </h2>
        <p id={bodyId} className="notice-dialog__body">
          {SUITE_PROTOTYPE_BODY}
        </p>
        <div className="notice-dialog__footer">
          <button
            ref={proceedRef}
            type="button"
            className="button button--primary"
            onClick={onProceed}
          >
            Proceed
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
