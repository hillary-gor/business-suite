'use client';

import { CompanyLogo } from '@/components/brand/company-logo';
import { DocumentPoweredBy } from '@/components/documents/document-brand';
import { formatMoney, type Money } from '@/lib/money';
import { formatDisplayDate } from '@/lib/payables';

export type InvoicePrintLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  sku?: string;
};

export type InvoicePrintModel = {
  title: string;
  brand: string;
  logoSrc: string;
  email: string | null;
  phone: string | null;
  registrationNumber: string | null;
  customerName: string;
  customerEmail: string | null;
  billTo: string | null;
  shipTo: string | null;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  po: string | null;
  notes: string;
  currency: string;
  subtotal: Money;
  tax: Money;
  total: Money;
  lines: InvoicePrintLine[];
};

export function InvoiceA4Sheet({
  model,
  packing = false,
}: {
  model: InvoicePrintModel;
  packing?: boolean;
}) {
  return (
    <article className={`invoice-a4${packing ? ' is-packing' : ''}`}>
      <header className="invoice-a4__head">
        <div>
          <p className="invoice-a4__kicker">{packing ? 'Packing list' : 'Invoice'}</p>
          <h1>{model.title}</h1>
          <p className="invoice-a4__brand">{model.brand}</p>
          {model.email ? <p>{model.email}</p> : null}
          {model.phone ? <p>{model.phone}</p> : null}
          {model.registrationNumber ? <p>Reg. {model.registrationNumber}</p> : null}
        </div>
        <CompanyLogo src={model.logoSrc} alt={model.brand} className="invoice-a4__logo" />
      </header>

      <div className="invoice-a4__meta">
        <div>
          <h2>Bill to</h2>
          <p>{model.customerName}</p>
          {model.customerEmail ? <p>{model.customerEmail}</p> : null}
          {model.billTo ? <p className="invoice-a4__pre">{model.billTo}</p> : null}
          {model.shipTo ? (
            <>
              <h2>Ship to</h2>
              <p className="invoice-a4__pre">{model.shipTo}</p>
            </>
          ) : null}
        </div>
        <dl>
          <div>
            <dt>{packing ? 'List no.' : 'Invoice no.'}</dt>
            <dd>{model.invoiceNo}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>{formatDisplayDate(model.invoiceDate)}</dd>
          </div>
          {!packing && model.dueDate ? (
            <div>
              <dt>Due date</dt>
              <dd>{formatDisplayDate(model.dueDate)}</dd>
            </div>
          ) : null}
          {model.po ? (
            <div>
              <dt>Customer PO</dt>
              <dd>{model.po}</dd>
            </div>
          ) : null}
          {!packing ? (
            <div>
              <dt>Balance due</dt>
              <dd>{formatMoney(model.total, { currency: model.currency, showCurrency: true })}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <table className="invoice-a4__lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Product / service</th>
            <th>SKU</th>
            <th className="numeric">Qty</th>
            {packing ? null : (
              <>
                <th className="numeric">Rate</th>
                <th className="numeric">Amount</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {model.lines.length === 0 ? (
            <tr>
              <td colSpan={packing ? 4 : 6}>No lines yet.</td>
            </tr>
          ) : (
            model.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td>{index + 1}</td>
                <td>{line.description || '—'}</td>
                <td>{line.sku ?? '—'}</td>
                <td className="numeric">{line.quantity}</td>
                {packing ? null : (
                  <>
                    <td className="numeric">
                      {formatMoney(line.unitPrice || '0', { currency: model.currency })}
                    </td>
                    <td className="numeric">
                      {formatMoney(line.amount || '0', {
                        currency: model.currency,
                        showCurrency: true,
                      })}
                    </td>
                  </>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {packing ? null : (
        <div className="invoice-a4__totals">
          <div>
            <span>Subtotal</span>
            <strong>
              {formatMoney(model.subtotal, { currency: model.currency, showCurrency: true })}
            </strong>
          </div>
          <div>
            <span>Tax</span>
            <strong>
              {formatMoney(model.tax, { currency: model.currency, showCurrency: true })}
            </strong>
          </div>
          <div>
            <span>Total</span>
            <strong>
              {formatMoney(model.total, { currency: model.currency, showCurrency: true })}
            </strong>
          </div>
        </div>
      )}

      {model.notes ? (
        <section className="invoice-a4__notes">
          <h2>{packing ? 'Notes' : 'Message to customer'}</h2>
          <p className="invoice-a4__pre">{model.notes}</p>
        </section>
      ) : null}
    </article>
  );
}

export function InvoiceEmailCard({
  model,
  message,
  onViewDetails,
}: {
  model: InvoicePrintModel;
  message: string;
  onViewDetails: () => void;
}) {
  const total = formatMoney(model.total, { currency: model.currency, showCurrency: true });
  return (
    <div className="invoice-email">
      <article className="invoice-email__card">
        <CompanyLogo src={model.logoSrc} alt={model.brand} className="invoice-email__logo" />
        <h2>Your invoice is ready!</h2>
        <p className="invoice-email__total">Total {total}</p>
        <div className="invoice-email__due">
          <span>Balance due</span>
          <strong>{total}</strong>
        </div>
        <p className="invoice-email__message">
          {message.trim() || 'The email message you write will go here.'}
        </p>
        <button
          type="button"
          className="button button--primary invoice-email__cta"
          onClick={onViewDetails}
        >
          View details
        </button>
        <div className="invoice-email__sender">
          <p>{model.brand}</p>
          {model.email ? <p>{model.email}</p> : null}
          {model.phone ? <p>{model.phone}</p> : null}
        </div>
        <p className="invoice-email__legal">
          If you receive an email that seems fraudulent, check with {model.brand} before paying.
        </p>
        <DocumentPoweredBy />
      </article>
    </div>
  );
}
