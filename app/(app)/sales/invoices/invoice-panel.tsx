'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { MenuButton } from '@/components/lists/list-chrome';
import { Amount, Quantity } from '@/components/ui';
import { Money } from '@/lib/money';
import { formatDisplayDate } from '@/lib/payables';
import { formatInvoiceActivityAt, invoiceActivitySteps } from '@/lib/sales-invoices';
import { salesTxnStatusLabel } from '@/lib/sales-transactions';
import { invoiceEditHref, invoicePanelMoreActions, type InvoiceActionState } from './row-actions';

export type InvoicePanelInvoice = {
  id: string;
  invoice_no: string | null;
  status: string;
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  invoice_date: string;
  due_date: string;
  currency_code: string;
  total: string;
  outstanding: string;
  issued_at: string | null;
  paid_on: string | null;
};

export type InvoicePanelLine = {
  line_no: number;
  description: string;
  quantity: string;
  line_net: string;
  tax_amount: string;
};

export function InvoiceDetailPanel({
  invoice,
  lines,
  today,
  mayPay,
  mayVoid,
  onClose,
}: {
  invoice: InvoicePanelInvoice | null;
  lines: InvoicePanelLine[];
  today: string;
  mayPay: boolean;
  mayVoid: boolean;
  onClose: () => void;
}) {
  const title = invoice?.invoice_no ? `Invoice ${invoice.invoice_no}` : 'Invoice';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="invoice-detail" aria-label={title}>
      <header className="invoice-detail__header">
        <h2>{title}</h2>
        <button
          type="button"
          className="invoice-detail__close"
          aria-label="Close"
          onClick={onClose}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>
      {invoice ? (
        <InvoiceDetailBody
          invoice={invoice}
          lines={lines}
          today={today}
          mayPay={mayPay}
          mayVoid={mayVoid}
        />
      ) : (
        <div className="invoice-detail__body">
          <p className="invoice-detail__missing">This invoice is not in this company.</p>
        </div>
      )}
    </aside>
  );
}

function InvoiceDetailBody({
  invoice,
  lines,
  today,
  mayPay,
  mayVoid,
}: {
  invoice: InvoicePanelInvoice;
  lines: InvoicePanelLine[];
  today: string;
  mayPay: boolean;
  mayVoid: boolean;
}) {
  const actions: InvoiceActionState = {
    id: invoice.id,
    customerId: invoice.customer_id,
    docStatus: invoice.status,
    balance: invoice.outstanding,
    mayPay,
    mayVoid,
  };
  const status = salesTxnStatusLabel({
    kind: 'invoice',
    docStatus: invoice.status,
    balance: invoice.outstanding,
    dueDate: invoice.due_date,
    convertedInvoiceId: null,
    today,
  });
  const steps = invoiceActivitySteps({
    issuedAt: invoice.issued_at,
    outstanding: invoice.outstanding,
    status: invoice.status,
    paidOn: invoice.paid_on,
  });
  const email = invoice.customer_email?.trim() || null;

  return (
    <>
      <div className="invoice-detail__body">
        <p className="invoice-detail__status">{status}</p>
        <p className="invoice-detail__due">
          <Amount
            value={invoice.outstanding}
            currency={invoice.currency_code}
            showCurrency
            emphasis
          />
        </p>
        <dl className="invoice-detail__dates">
          <div>
            <dt>Invoice date</dt>
            <dd>{formatDisplayDate(invoice.invoice_date)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDisplayDate(invoice.due_date)}</dd>
          </div>
        </dl>

        <Accordion title="Customer information" defaultOpen>
          <p className="invoice-detail__customer">{invoice.customer_name}</p>
          {email ? (
            <a className="invoice-detail__email" href={`mailto:${email}`}>
              {email}
            </a>
          ) : (
            <p className="invoice-detail__muted">No email on file</p>
          )}
        </Accordion>

        <Accordion title="Invoice activity" defaultOpen>
          <ol className="invoice-activity">
            {steps.map((step) => (
              <li key={step.id} className={step.complete ? 'is-complete' : undefined}>
                <span className="invoice-activity__dot" aria-hidden="true" />
                <span className="invoice-activity__label">{step.label}</span>
                {step.at ? (
                  <span className="invoice-activity__at">{formatInvoiceActivityAt(step.at)}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Accordion>

        <Accordion title="Products and services">
          {lines.length === 0 ? (
            <p className="invoice-detail__muted">No line items</p>
          ) : (
            <ul className="invoice-detail__lines">
              {lines.map((line) => (
                <li key={line.line_no}>
                  <span className="invoice-detail__line-name">{line.description}</span>
                  <span className="invoice-detail__line-meta">
                    <Quantity value={line.quantity} />
                    <Amount
                      value={Money.from(line.line_net).plus(line.tax_amount)}
                      currency={invoice.currency_code}
                      showCurrency
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Accordion>
      </div>
      <footer className="invoice-detail__footer">
        <MenuButton label="More actions" items={invoicePanelMoreActions(actions)} />
        <Link href={invoiceEditHref(invoice.id)} className="button button--primary">
          Edit invoice
        </Link>
      </footer>
    </>
  );
}

function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="invoice-accordion">
      <button
        type="button"
        className="invoice-accordion__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      <div id={panelId} hidden={!open} className="invoice-accordion__body">
        {children}
      </div>
    </section>
  );
}
