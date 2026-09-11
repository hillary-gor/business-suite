'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DotsLoader } from '@/components/loading/dots-loader';

export function LibraryDialog({
  title,
  children,
  confirmLabel,
  pending = false,
  danger = false,
  wide = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  pending?: boolean;
  danger?: boolean;
  wide?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  const titleId = useId();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, pending]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="library-dialog-root">
      <button
        type="button"
        className="library-dialog__backdrop"
        aria-label="Close"
        onClick={() => {
          if (!pending) onClose();
        }}
      />
      <div
        className={wide ? 'library-dialog library-dialog--wide' : 'library-dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="library-dialog__head">
          <h2 id={titleId} className="library-dialog__title">
            {title}
          </h2>
          <button
            type="button"
            className="button button--ghost button--small"
            onClick={onClose}
            disabled={pending}
          >
            Close
          </button>
        </div>
        <div className="library-dialog__body">{children}</div>
        {onConfirm || confirmLabel ? (
          <div className="library-dialog__footer">
            <button type="button" className="button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            {onConfirm ? (
              <button
                type="button"
                className={danger ? 'button button--danger' : 'button button--primary'}
                onClick={onConfirm}
                disabled={pending}
              >
                {pending ? <DotsLoader label={confirmLabel ?? 'Working'} /> : confirmLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
