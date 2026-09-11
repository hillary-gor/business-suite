'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { acceptQuotationAction, convertQuotationAction } from '@/server/actions/sales';
import { documentPdfPath } from '@/lib/documents/href';

export function EstimateRowActions({
  quotationId,
  status,
  convertedInvoiceId,
  canAct,
}: {
  quotationId: string;
  status: string;
  convertedInvoiceId: string | null;
  canAct: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canAccept = canAct && (status === 'DRAFT' || status === 'SENT');
  const canConvert = canAct && status !== 'CANCELLED' && !convertedInvoiceId;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  function accept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuotationAction({ quotationId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function convert() {
    setError(null);
    setOpen(false);
    startTransition(async () => {
      const result = await convertQuotationAction({ quotationId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/sales/invoices/${result.data.invoiceId}`);
      router.refresh();
    });
  }

  const menu: Array<{ label: string; href?: string; onSelect?: () => void }> = [
    { label: 'Print', href: documentPdfPath('quotation', quotationId) },
    { label: 'Proforma invoice', href: documentPdfPath('proforma-invoice', quotationId) },
  ];
  if (canConvert) menu.push({ label: 'Convert to invoice', onSelect: convert });
  if (convertedInvoiceId) {
    menu.push({ label: 'Open invoice', href: `/sales/invoices/${convertedInvoiceId}` });
  }

  return (
    <div className="row-action" ref={rootRef}>
      <Link href={`/sales/estimates/new?quotationId=${quotationId}`} className="row-action__link">
        View/Edit
      </Link>
      {canAccept ? (
        <button type="button" className="row-action__link" disabled={pending} onClick={accept}>
          Mark accepted
        </button>
      ) : canConvert ? (
        <button type="button" className="row-action__link" disabled={pending} onClick={convert}>
          Convert to invoice
        </button>
      ) : convertedInvoiceId ? (
        <Link href={`/sales/invoices/${convertedInvoiceId}`} className="row-action__link">
          Open invoice
        </Link>
      ) : null}
      {menu.length > 0 ? (
        <>
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
              {menu.map((item) =>
                item.href?.startsWith('/documents/') ? (
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
                  <button key={item.label} type="button" onClick={item.onSelect}>
                    {item.label}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </>
      ) : null}
      {error ? <span className="row-action__error">{error}</span> : null}
    </div>
  );
}
