'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  acceptQuotationAction,
  convertOrderAction,
  convertQuotationAction,
} from '@/server/actions/sales';
import { Money } from '@/lib/money';
import { documentPdfPath } from '@/lib/documents/href';

const STUB = 'Not in this version';
const PERM = 'You do not have permission';

type MenuItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  title?: string;
};

export function TransactionRowActions({
  kind,
  id,
  customerId,
  href,
  docStatus,
  balance,
  convertedInvoiceId,
  mayInvoice,
  mayPay,
  mayVoid,
}: {
  kind: string;
  id: string;
  customerId: string;
  href: string | null;
  docStatus: string;
  balance: string;
  convertedInvoiceId: string | null;
  mayInvoice: boolean;
  mayPay: boolean;
  mayVoid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const outstanding = Money.from(balance).isPositive();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  function run(
    work: () => Promise<{ ok: boolean; error?: string; data?: { invoiceId?: string } }>,
  ) {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? 'That action could not be completed.');
        return;
      }
      if (result.data?.invoiceId) {
        router.push(`/sales/invoices/${result.data.invoiceId}`);
      }
      router.refresh();
    });
  }

  const items = menuItems({
    kind,
    id,
    customerId,
    href,
    docStatus,
    outstanding,
    convertedInvoiceId,
    mayInvoice,
    mayPay,
    mayVoid,
    convertEstimate: () =>
      run(async () => {
        const result = await convertQuotationAction({ quotationId: id });
        return result;
      }),
    acceptEstimate: () =>
      run(async () => {
        const result = await acceptQuotationAction({ quotationId: id });
        return result;
      }),
    convertOrder: () =>
      run(async () => {
        const result = await convertOrderAction({ salesOrderId: id });
        return result;
      }),
  });

  const primary = primaryAction(kind, href, customerId, outstanding, mayPay, mayInvoice, docStatus);

  return (
    <div className="row-action" ref={rootRef}>
      {primary.href ? (
        <Link href={primary.href} className="row-action__link">
          {primary.label}
        </Link>
      ) : (
        <span className="row-action__link">{primary.label}</span>
      )}
      <button
        type="button"
        className="row-action__chevron"
        aria-label="More actions"
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
      >
        ▾
      </button>
      {open ? (
        <div className="row-action__panel">
          {items.map((item) =>
            item.disabled || (!item.href && !item.onSelect) ? (
              <span key={item.label} className="split-menu__item--disabled" title={item.title}>
                {item.label}
              </span>
            ) : item.href?.startsWith('/documents/') ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </a>
            ) : item.href ? (
              <Link key={item.label} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ) : (
              <button key={item.label} type="button" onClick={item.onSelect} disabled={pending}>
                {item.label}
              </button>
            ),
          )}
        </div>
      ) : null}
      {error ? <span className="row-action__error">{error}</span> : null}
    </div>
  );
}

function stub(label: string): MenuItem {
  return { label, disabled: true, title: STUB };
}

function perm(label: string): MenuItem {
  return { label, disabled: true, title: PERM };
}

function primaryAction(
  kind: string,
  href: string | null,
  customerId: string,
  outstanding: boolean,
  mayPay: boolean,
  mayInvoice: boolean,
  docStatus: string,
): { label: string; href?: string } {
  if (kind === 'invoice' && outstanding && docStatus === 'ISSUED') {
    return mayPay
      ? { label: 'Receive payment', href: `/sales/payments/new?customerId=${customerId}` }
      : { label: 'View/Edit', href: href ?? undefined };
  }
  if (kind === 'estimate' && (docStatus === 'DRAFT' || docStatus === 'SENT') && mayInvoice) {
    return { label: 'View/Edit', href: href ?? undefined };
  }
  if (href) return { label: 'View/Edit', href };
  return { label: 'View/Edit' };
}

function menuItems(input: {
  kind: string;
  id: string;
  customerId: string;
  href: string | null;
  docStatus: string;
  outstanding: boolean;
  convertedInvoiceId: string | null;
  mayInvoice: boolean;
  mayPay: boolean;
  mayVoid: boolean;
  convertEstimate: () => void;
  acceptEstimate: () => void;
  convertOrder: () => void;
}): MenuItem[] {
  const viewEdit: MenuItem = input.href
    ? { label: 'View/Edit', href: input.href }
    : stub('View/Edit');

  if (input.kind === 'payment') {
    return [
      { label: 'Print', href: documentPdfPath('receipt', input.id) },
      stub('Void'),
      stub('Delete'),
      stub('View activity'),
    ];
  }

  if (input.kind === 'estimate') {
    const canConvert =
      input.mayInvoice && input.docStatus !== 'CANCELLED' && !input.convertedInvoiceId;
    const canAccept =
      input.mayInvoice && (input.docStatus === 'DRAFT' || input.docStatus === 'SENT');
    return [
      canConvert
        ? { label: 'Convert to invoice', onSelect: input.convertEstimate }
        : input.mayInvoice
          ? stub('Convert to invoice')
          : perm('Convert to invoice'),
      stub('Convert to sales order'),
      viewEdit,
      stub('Duplicate'),
      stub('Send'),
      stub('Share estimate link'),
      { label: 'Print', href: documentPdfPath('quotation', input.id) },
      canAccept
        ? { label: 'Update Status', onSelect: input.acceptEstimate }
        : input.mayInvoice
          ? stub('Update Status')
          : perm('Update Status'),
      stub('Copy to purchase order'),
      stub('Delete'),
      stub('View activity'),
    ];
  }

  if (input.kind === 'invoice') {
    return [
      viewEdit,
      stub('Duplicate'),
      stub('Send'),
      stub('Create task'),
      stub('Share invoice link'),
      { label: 'Print packing slip', href: documentPdfPath('packing-list', input.id) },
      { label: 'Proof of delivery', href: documentPdfPath('proof-of-delivery', input.id) },
      { label: 'Print', href: documentPdfPath('invoice', input.id) },
      input.docStatus === 'ISSUED' && input.mayVoid
        ? { label: 'Void', href: `/sales/invoices/${input.id}` }
        : input.docStatus === 'ISSUED'
          ? perm('Void')
          : stub('Void'),
      stub('Delete'),
      stub('View activity'),
    ];
  }

  if (input.kind === 'sales_order') {
    const canConvert =
      input.mayInvoice && !input.convertedInvoiceId && input.docStatus !== 'CANCELLED';
    return [
      viewEdit,
      canConvert
        ? { label: 'Convert to invoice', onSelect: input.convertOrder }
        : input.convertedInvoiceId
          ? { label: 'Open invoice', href: `/sales/invoices/${input.convertedInvoiceId}` }
          : stub('Convert to invoice'),
      { label: 'Print', href: documentPdfPath('sales-order', input.id) },
      { label: 'Picking list', href: documentPdfPath('picking-list', input.id) },
      { label: 'Delivery note', href: documentPdfPath('delivery-note', input.id) },
    ];
  }

  return [viewEdit];
}
