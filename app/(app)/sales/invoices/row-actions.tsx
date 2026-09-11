'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Money } from '@/lib/money';
import { documentPdfPath } from '@/lib/documents/href';

const STUB = 'Not in this version';
const PERM = 'You do not have permission';

export type InvoiceMenuItem = {
  label: string;
  href?: string;
  disabled?: boolean;
  title?: string;
};

export type InvoiceActionState = {
  id: string;
  customerId: string;
  docStatus: string;
  balance: string;
  mayPay: boolean;
  mayVoid: boolean;
};

export function invoiceReceivePaymentHref(customerId: string): string {
  return `/sales/payments/new?customerId=${customerId}`;
}

export function invoiceEditHref(id: string): string {
  return `/sales/invoices/${id}`;
}

export function invoiceCanReceivePayment(docStatus: string, balance: string): boolean {
  return docStatus === 'ISSUED' && Money.from(balance).isPositive();
}

export function invoiceReceivePaymentItem(input: InvoiceActionState): InvoiceMenuItem {
  if (!invoiceCanReceivePayment(input.docStatus, input.balance)) {
    return { label: 'Receive payment', disabled: true };
  }
  if (!input.mayPay) return perm('Receive payment');
  return { label: 'Receive payment', href: invoiceReceivePaymentHref(input.customerId) };
}

export function invoiceVoidItem(input: InvoiceActionState): InvoiceMenuItem {
  if (input.docStatus !== 'ISSUED') return stub('Void');
  if (!input.mayVoid) return perm('Void');
  return { label: 'Void', href: invoiceEditHref(input.id) };
}

export function invoicePrintItem(id: string): InvoiceMenuItem {
  return { label: 'Print', href: documentPdfPath('invoice', id) };
}

export function invoicePackingItem(id: string): InvoiceMenuItem {
  return { label: 'Print packing slip', href: documentPdfPath('packing-list', id) };
}

export function invoicePodItem(id: string): InvoiceMenuItem {
  return { label: 'Proof of delivery', href: documentPdfPath('proof-of-delivery', id) };
}

export function invoicePanelMoreActions(input: InvoiceActionState): InvoiceMenuItem[] {
  return [
    invoiceReceivePaymentItem(input),
    stub('Duplicate'),
    stub('Send'),
    stub('Send reminder'),
    stub('Create task'),
    stub('Share invoice link'),
    invoicePrintItem(input.id),
    invoicePackingItem(input.id),
    invoicePodItem(input.id),
    invoiceVoidItem(input),
    stub('Delete'),
  ];
}

export function invoiceRowMenuItems(input: InvoiceActionState): InvoiceMenuItem[] {
  return [
    { label: 'View/Edit', href: invoiceEditHref(input.id) },
    stub('Duplicate'),
    stub('Send'),
    stub('Send reminder'),
    stub('Create task'),
    stub('Share invoice link'),
    invoicePrintItem(input.id),
    invoicePackingItem(input.id),
    invoicePodItem(input.id),
    invoiceVoidItem(input),
    stub('Delete'),
    stub('View activity'),
    stub('Set reminder workflows'),
  ];
}

export function InvoiceRowActions(input: InvoiceActionState) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const href = invoiceEditHref(input.id);
  const receive = invoiceReceivePaymentItem(input);
  const items = invoiceRowMenuItems(input);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  return (
    <div className="row-action" ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <Link href={href} className="row-action__link">
        View/Edit
      </Link>
      <span className="row-action__sep" aria-hidden="true">
        |
      </span>
      {receive.href ? (
        <Link href={receive.href} className="row-action__link">
          Receive payment
        </Link>
      ) : receive.disabled && receive.title === PERM ? (
        <span className="row-action__link is-disabled" title={PERM}>
          Receive payment
        </span>
      ) : null}
      <button
        type="button"
        className="row-action__chevron"
        aria-label="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        ▾
      </button>
      {open ? (
        <div className="row-action__panel">
          {items.map((item) =>
            item.disabled || !item.href ? (
              <span key={item.label} className="split-menu__item--disabled" title={item.title}>
                {item.label}
              </span>
            ) : item.href.startsWith('/documents/') ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : (
              <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function stub(label: string): InvoiceMenuItem {
  return { label, disabled: true, title: STUB };
}

function perm(label: string): InvoiceMenuItem {
  return { label, disabled: true, title: PERM };
}
