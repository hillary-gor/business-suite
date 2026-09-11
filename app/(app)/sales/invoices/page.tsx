import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { Amount, PageHeader } from '@/components/ui';
import { Money } from '@/lib/money';
import { nairobiToday } from '@/lib/payables';
import { barSharePercent, paidWindow, unpaidWindow } from '@/lib/sales-overview';
import {
  invoiceListDateBounds,
  invoiceListQueryString,
  parseInvoiceListQuery,
} from '@/lib/sales-invoices';
import { getInvoice, listInvoices } from '@/server/modules/sales/documents';
import { getInvoiceListSummary } from '@/server/modules/sales/overview';
import { InvoiceListWorkspace } from './invoice-list';
import { InvoiceSummaryRibbon } from './summary';
import { InvoicePrefsSync, InvoicesToolbar } from './toolbar';

export const metadata = { title: 'Invoices · SkyJet' };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayCreate = can(session, entity.entityId, Permission.SalesInvoiceCreate);
  const mayPay = can(session, entity.entityId, Permission.SalesPaymentCreate);
  if (!mayCreate && !mayPay) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (sales.invoice.create or sales.payment.create required)',
    );
  }

  const params = await searchParams;
  const query = parseInvoiceListQuery(params);
  const today = nairobiToday();
  const bounds = invoiceListDateBounds(query.range, today);
  const unpaid = unpaidWindow(today);
  const paid = paidWindow(today);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const [ribbon, list, selected] = await Promise.all([
    getInvoiceListSummary(context, {
      unpaidFrom: unpaid.from,
      unpaidTo: unpaid.to,
      paidFrom: paid.from,
      paidTo: paid.to,
      today,
    }),
    listInvoices(context, {
      status: query.status,
      from: bounds.from,
      to: bounds.to,
      today,
      sort: query.sort,
      dir: query.dir,
      limit: query.rows,
      offset: (query.page - 1) * query.rows,
    }),
    query.invoice ? getInvoice(context, query.invoice) : Promise.resolve(null),
  ]);

  const page = list.page;
  const lastPage = Math.max(1, Math.ceil(list.total / query.rows));
  const mayVoid = can(session, entity.entityId, Permission.SalesInvoiceVoid);
  const currency = entity.baseCurrency;
  const unpaidTotal = Money.from(ribbon.unpaid.overdue).plus(ribbon.unpaid.not_due);
  const paidTotal = Money.from(ribbon.paid.amount);

  return (
    <>
      <PageHeader title="Invoices" />
      <InvoicePrefsSync query={query} />

      <InvoiceSummaryRibbon>
        <article>
          <p className="sales-ov__bucket-total">
            <Amount value={unpaidTotal} currency={currency} showCurrency /> Unpaid
            <span className="sales-ov__bucket-when"> Last 365 days</span>
          </p>
          <div className="sales-ov__bucket-split">
            <p>
              <Amount value={ribbon.unpaid.overdue} currency={currency} showCurrency />
              <span> Overdue</span>
            </p>
            <p>
              <Amount value={ribbon.unpaid.not_due} currency={currency} showCurrency />
              <span> Not due yet</span>
            </p>
          </div>
          <InvoiceBar
            left={ribbon.unpaid.overdue}
            right={ribbon.unpaid.not_due}
            leftClass="is-overdue"
            rightClass="is-unpaid"
          />
        </article>
        <article>
          <p className="sales-ov__bucket-total">
            <Amount value={paidTotal} currency={currency} showCurrency /> Paid
            <span className="sales-ov__bucket-when"> Last 30 days</span>
          </p>
          <div className="sales-ov__bucket-split">
            <p>
              <Amount value="0" currency={currency} showCurrency />
              <span> Not deposited</span>
            </p>
            <p>
              <Amount value={paidTotal} currency={currency} showCurrency />
              <span> Deposited</span>
            </p>
          </div>
          <InvoiceBar
            left="0"
            right={paidTotal.toDatabase()}
            leftClass="is-undeposited"
            rightClass="is-paid"
          />
          <p className="sales-ov__note">
            Posted receipts go to a bank or cash account, so they show as deposited. There is no
            undeposited-funds step yet.
          </p>
        </article>
      </InvoiceSummaryRibbon>

      <div className="tabs" aria-label="Invoice views">
        <Link href={`/sales/invoices${invoiceListQueryString(query)}`} aria-current="page">
          All invoices
        </Link>
      </div>

      <InvoicesToolbar query={query} mayCreate={mayCreate} />

      <InvoiceListWorkspace
        query={query}
        rows={list.rows}
        total={list.total}
        page={page}
        lastPage={lastPage}
        today={today}
        mayPay={mayPay}
        mayVoid={mayVoid}
        selectedInvoice={selected?.invoice ?? null}
        selectedLines={selected?.lines ?? []}
      />
    </>
  );
}

function InvoiceBar({
  left,
  right,
  leftClass,
  rightClass,
}: {
  left: string;
  right: string;
  leftClass: string;
  rightClass: string;
}) {
  const total = Money.from(left).plus(right);
  return (
    <div className="sales-ov__bar" aria-hidden="true">
      <span
        className={`sales-ov__bar-fill ${leftClass}`}
        style={{ width: `${barSharePercent(left, total.toDatabase())}%` }}
      />
      <span
        className={`sales-ov__bar-fill ${rightClass}`}
        style={{ width: `${barSharePercent(right, total.toDatabase())}%` }}
      />
    </div>
  );
}
