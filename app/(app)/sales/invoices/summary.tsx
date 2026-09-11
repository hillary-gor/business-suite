'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { INVOICE_LIST_SUMMARY_KEY } from '@/lib/sales-invoices';

export function InvoiceSummaryRibbon({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(INVOICE_LIST_SUMMARY_KEY) === '0') {
        setOpen(false);
      }
    } catch {
      // Preference storage is optional.
    }
  }, []);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(INVOICE_LIST_SUMMARY_KEY, next ? '1' : '0');
      } catch {
        // Preference storage is optional.
      }
      return next;
    });
  }

  return (
    <section className="sales-inv-ribbon" aria-label="Invoice summary">
      <button
        type="button"
        className="sales-inv-ribbon__collapse"
        aria-expanded={open}
        aria-controls="invoice-summary-body"
        aria-label={open ? 'Hide summary' : 'Show summary'}
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          {open ? (
            <path
              d="M6 14.5 12 8.5l6 6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path
              d="M6 9.5 12 15.5l6-6"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </button>
      {open ? (
        <div id="invoice-summary-body" className="sales-ov__invoice-cols">
          {children}
        </div>
      ) : null}
    </section>
  );
}
