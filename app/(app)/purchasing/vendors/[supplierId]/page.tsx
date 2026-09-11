import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import {
  getSupplier,
  listExpenseTransactions,
  listSupplierDirectory,
} from '@/server/modules/purchasing/lists';
import { Amount, Card, DataTable, EmptyState } from '@/components/ui';
import { documentPdfPath } from '@/lib/documents/href';
import { Money } from '@/lib/money';
import { expenseKindLabel, formatDisplayDate, nairobiToday, toCsv } from '@/lib/payables';
import {
  parseSupplierId,
  parseSupplierQuery,
  supplierDateBounds,
  supplierDateChipLabel,
  supplierQueryString,
} from '@/lib/supplier-hub';
import { ColumnTable } from '../../column-table';
import { RowAction, SplitMenu } from '@/components/lists/list-chrome';
import { SupplierRailControls, SupplierTxnToolbar } from './supplier-controls';

export const metadata = { title: 'Supplier · SkyJet' };

const TXN_COLUMNS = [
  { id: 'date', label: 'Date' },
  { id: 'type', label: 'Type' },
  { id: 'no', label: 'No.' },
  { id: 'payee', label: 'Payee' },
  { id: 'category', label: 'Category' },
  { id: 'pretax', label: 'Total before sales tax' },
  { id: 'tax', label: 'Sales tax' },
  { id: 'total', label: 'Total' },
  { id: 'approval', label: 'Bill approval' },
  { id: 'action', label: 'Action' },
];

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const mayVendors = can(session, entity.entityId, Permission.MastersManageSuppliers);
  const mayPo = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayReceive = can(session, entity.entityId, Permission.ProcurementPurchaseReceive);
  const mayPay = can(session, entity.entityId, Permission.FinancePaymentCreate);
  if (!mayVendors && !mayPo && !mayReceive && !mayPay) {
    throw new PermissionDeniedError('You do not have permission to view suppliers');
  }

  const { supplierId: rawId } = await params;
  const supplierId = parseSupplierId(rawId);
  if (!supplierId) notFound();

  const query = parseSupplierQuery(await searchParams);
  const today = nairobiToday();
  const bounds = supplierDateBounds(query.range, today);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const [supplier, directory, rows] = await Promise.all([
    getSupplier(context, supplierId),
    listSupplierDirectory(context, query.q),
    listExpenseTransactions(context, {
      from: bounds.from,
      to: bounds.to,
      kind: query.kind,
      baseCurrency: entity.baseCurrency,
      supplierId,
    }),
  ]);
  if (!supplier) notFound();

  const sorted = [...directory].sort((left, right) => {
    if (query.sort === 'balance') {
      const compared = Money.from(right.open_balance).comparedTo(left.open_balance);
      if (compared !== 0) return compared;
    }
    return left.legal_name.localeCompare(right.legal_name);
  });

  let pretax = Money.zero();
  let tax = Money.zero();
  let total = Money.zero();
  for (const row of rows) {
    pretax = pretax.plus(row.subtotal);
    tax = tax.plus(row.tax_total);
    total = total.plus(row.total);
  }

  const hrefFor = (patch: Partial<typeof query>) =>
    `/purchasing/vendors/${supplierId}${supplierQueryString({ ...query, ...patch })}`;

  const csv = toCsv([
    TXN_COLUMNS.filter((column) => column.id !== 'action').map((column) => column.label),
    ...rows.map((row) => [
      formatDisplayDate(row.doc_date),
      expenseKindLabel(row.kind),
      row.doc_no ?? '',
      row.payee,
      row.category ?? '',
      row.subtotal,
      row.tax_total,
      row.total,
      row.approval ?? '',
    ]),
  ]);

  const newTxnItems = [
    {
      label: 'Expense',
      href: `/purchasing/expenses/new?supplierId=${supplierId}`,
      disabled: !mayPay,
    },
    { label: 'Bill', href: `/purchasing/bills/new?supplierId=${supplierId}`, disabled: !mayPay },
    {
      label: 'Purchase order',
      href: `/purchasing/orders/new?supplierId=${supplierId}`,
      disabled: !mayPo,
    },
    {
      label: 'Item receipt',
      href: `/purchasing/receipts/new?supplierId=${supplierId}`,
      disabled: !mayReceive,
    },
    {
      label: 'Supplier credit',
      href: `/purchasing/credits/new?supplierId=${supplierId}`,
      disabled: !mayPay,
    },
    {
      label: 'Pay bills',
      href: `/purchasing/payments/new?supplierId=${supplierId}`,
      disabled: !mayPay,
    },
  ];
  const newTxnHref = newTxnItems.find((item) => !item.disabled)?.href;

  return (
    <div className="party-workspace">
      <header className="party-workspace__top">
        <Link href="/purchasing/vendors" className="party-back">
          ‹ Suppliers
        </Link>
        <div className="party-workspace__actions">
          {mayPay ? (
            <a
              href={documentPdfPath('supplier-statement', supplierId, { asOf: today })}
              className="button"
              target="_blank"
              rel="noreferrer"
            >
              Download statement
            </a>
          ) : null}
          {mayVendors ? (
            <SplitMenu
              label="Edit"
              href={`/purchasing/vendors/${supplierId}/edit`}
              items={[
                { label: 'Edit', href: `/purchasing/vendors/${supplierId}/edit` },
                { label: 'Make inactive', disabled: true, title: 'Not in this version' },
              ]}
            />
          ) : null}
          {newTxnHref ? (
            <SplitMenu label="New transaction" href={newTxnHref} primary items={newTxnItems} />
          ) : null}
        </div>
      </header>

      <div className="party-workspace__split">
        <aside className="party-rail" aria-label="Suppliers">
          <div className="party-rail__head">
            <p>Filter by name or details</p>
            {mayVendors ? (
              <Link
                href="/purchasing/vendors/new"
                className="party-rail__add"
                aria-label="New supplier"
              >
                +
              </Link>
            ) : null}
          </div>
          <SupplierRailControls supplierId={supplierId} query={query} />
          <ul className="party-rail__list">
            {sorted.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/purchasing/vendors/${row.id}${supplierQueryString({
                    ...query,
                    q: query.q,
                    page: 1,
                  })}`}
                  className={row.id === supplierId ? 'is-current' : undefined}
                  aria-current={row.id === supplierId ? 'page' : undefined}
                >
                  <span>{row.legal_name}</span>
                  <Amount value={row.open_balance} currency={row.currency_code} showCurrency />
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <div className="party-main">
          <section className="party-hero">
            <div className="party-hero__identity">
              <div className="party-hero__name">
                <h1>{supplier.legal_name}</h1>
                <div className="party-hero__icons">
                  {supplier.email ? (
                    <a href={`mailto:${supplier.email}`} aria-label="Email supplier">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 7.5 12 13l8-5.5M5 18h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1Z"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  ) : null}
                  {supplier.phone ? (
                    <a href={`tel:${supplier.phone}`} aria-label="Call supplier">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M7 4h3l1 4-2 1a12 12 0 0 0 6 6l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 5 6a2 2 0 0 1 2-2Z"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  ) : null}
                </div>
              </div>
              <dl className="party-facts">
                <div>
                  <dt>Company</dt>
                  <dd>{supplier.trading_name || supplier.legal_name}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>
                    {supplier.notes ? (
                      supplier.notes
                    ) : (
                      <Link href={hrefFor({ tab: 'notes' })}>Add notes</Link>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Billing address</dt>
                  <dd>{supplier.billing_address || '—'}</dd>
                </div>
                <div>
                  <dt>Bill Pay ACH info</dt>
                  <dd>—</dd>
                </div>
              </dl>
            </div>
            <aside className="party-summary" aria-label="Summary">
              <p className="party-summary__title">Summary</p>
              <p className="party-summary__row party-summary__row--open">
                <Amount
                  value={supplier.open_balance}
                  currency={supplier.currency_code}
                  showCurrency
                />
                <span>Open balance</span>
              </p>
              <p className="party-summary__row party-summary__row--overdue">
                <Amount
                  value={supplier.overdue_balance}
                  currency={supplier.currency_code}
                  showCurrency
                />
                <span>Overdue payment</span>
              </p>
            </aside>
          </section>

          <nav className="tabs party-tabs" aria-label="Supplier sections">
            <Link
              href={hrefFor({ tab: 'transactions' })}
              aria-current={query.tab === 'transactions' ? 'page' : undefined}
            >
              Transaction List
            </Link>
            <Link
              href={hrefFor({ tab: 'details' })}
              aria-current={query.tab === 'details' ? 'page' : undefined}
            >
              Supplier Details
            </Link>
            <Link
              href={hrefFor({ tab: 'notes' })}
              aria-current={query.tab === 'notes' ? 'page' : undefined}
            >
              Notes
            </Link>
          </nav>

          {query.tab === 'details' ? (
            <Card>
              <dl className="party-details">
                <div>
                  <dt>Display name</dt>
                  <dd>{supplier.legal_name}</dd>
                </div>
                <div>
                  <dt>Company</dt>
                  <dd>{supplier.trading_name || '—'}</dd>
                </div>
                <div>
                  <dt>Code</dt>
                  <dd>{supplier.code}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{supplier.email || '—'}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{supplier.phone || '—'}</dd>
                </div>
                <div>
                  <dt>Tax PIN</dt>
                  <dd>{supplier.tax_pin || '—'}</dd>
                </div>
                <div>
                  <dt>Currency</dt>
                  <dd>{supplier.currency_code}</dd>
                </div>
                <div>
                  <dt>Payment terms</dt>
                  <dd>{supplier.payment_terms_name || '—'}</dd>
                </div>
                <div>
                  <dt>Billing address</dt>
                  <dd>{supplier.billing_address || '—'}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{supplier.is_active ? supplier.approval_status : 'Inactive'}</dd>
                </div>
              </dl>
            </Card>
          ) : query.tab === 'notes' ? (
            <Card>
              {supplier.notes ? (
                <p className="party-notes">{supplier.notes}</p>
              ) : (
                <EmptyState
                  title="No notes yet"
                  description="Keep a remark on this supplier — payment instructions, quality notes, or anything the next person should see."
                  action={
                    mayVendors ? (
                      <Link
                        href={`/purchasing/vendors/${supplierId}/edit`}
                        className="button button--primary"
                      >
                        Add notes
                      </Link>
                    ) : null
                  }
                />
              )}
            </Card>
          ) : (
            <Card>
              <ColumnTable
                tableId="supplier-transactions"
                filename={`${supplier.legal_name}-transactions.csv`}
                csv={csv}
                columns={TXN_COLUMNS}
                leading={
                  <div className="party-txn-leading">
                    <SupplierTxnToolbar supplierId={supplierId} query={query} />
                    {query.range !== 'all' ? (
                      <div className="filter-chips">
                        <span className="filter-chip">
                          {supplierDateChipLabel(query.range)}
                          <Link href={hrefFor({ range: 'all' })} aria-label="Clear date filter">
                            ×
                          </Link>
                        </span>
                      </div>
                    ) : null}
                  </div>
                }
              >
                {rows.length === 0 ? (
                  <EmptyState
                    title="No results found"
                    description="Remove some filters or try a different date range."
                  />
                ) : (
                  <DataTable dense>
                    <thead>
                      <tr>
                        <th className="row-check">
                          <input type="checkbox" disabled aria-label="Select all" />
                        </th>
                        <th data-col="date">Date</th>
                        <th data-col="type">Type</th>
                        <th data-col="no">No.</th>
                        <th data-col="payee">Payee</th>
                        <th data-col="category">Category</th>
                        <th className="numeric" data-col="pretax">
                          Total before sales tax
                        </th>
                        <th className="numeric" data-col="tax">
                          Sales tax
                        </th>
                        <th className="numeric" data-col="total">
                          Total
                        </th>
                        <th data-col="approval">Bill approval</th>
                        <th data-col="action">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.kind}-${row.id}`}>
                          <td className="row-check">
                            <input
                              type="checkbox"
                              disabled
                              aria-label={`Select ${row.doc_no ?? row.kind}`}
                            />
                          </td>
                          <td data-col="date">{formatDisplayDate(row.doc_date)}</td>
                          <td data-col="type">{expenseKindLabel(row.kind)}</td>
                          <td className="cell-code" data-col="no">
                            {row.href && row.kind === 'purchase_order' ? (
                              <Link href={row.href}>{row.doc_no ?? 'Draft'}</Link>
                            ) : (
                              (row.doc_no ?? 'Draft')
                            )}
                          </td>
                          <td data-col="payee">{row.payee}</td>
                          <td data-col="category">{row.category ?? ''}</td>
                          <td className="numeric" data-col="pretax">
                            <Amount
                              value={row.subtotal}
                              currency={row.currency_code}
                              showCurrency
                            />
                          </td>
                          <td className="numeric" data-col="tax">
                            <Amount
                              value={row.tax_total}
                              currency={row.currency_code}
                              showCurrency
                            />
                          </td>
                          <td className="numeric" data-col="total">
                            <Amount value={row.total} currency={row.currency_code} showCurrency />
                          </td>
                          <td className="cell-muted" data-col="approval">
                            {row.kind === 'purchase_order' || row.kind === 'bill'
                              ? (row.approval ?? '')
                              : ''}
                          </td>
                          <td data-col="action">
                            <RowAction
                              label="View/Edit"
                              href={row.href ?? undefined}
                              items={
                                row.href ? [{ label: 'View/Edit', href: row.href }] : undefined
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className="row-check" />
                        <td data-col="date" colSpan={5}>
                          Total
                        </td>
                        <td className="numeric" data-col="pretax">
                          <Amount value={pretax} currency={entity.baseCurrency} showCurrency />
                        </td>
                        <td className="numeric" data-col="tax">
                          <Amount value={tax} currency={entity.baseCurrency} showCurrency />
                        </td>
                        <td className="numeric" data-col="total">
                          <Amount value={total} currency={entity.baseCurrency} showCurrency />
                        </td>
                        <td data-col="approval" />
                        <td data-col="action" />
                      </tr>
                    </tfoot>
                  </DataTable>
                )}
              </ColumnTable>
              <p className="list-pager list-pager--nav">
                <span className="list-pager__links">
                  <span className="is-disabled">First</span>
                  <span className="is-disabled">Previous</span>
                  <span>
                    {rows.length === 0 ? '0 - 0 of 0' : `1 - ${rows.length} of ${rows.length}`}
                  </span>
                  <span className="is-disabled">Next</span>
                  <span className="is-disabled">Last</span>
                </span>
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
