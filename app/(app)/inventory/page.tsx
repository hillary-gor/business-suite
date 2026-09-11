import Link from 'next/link';
import type { ReactNode } from 'react';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { Amount, Quantity } from '@/components/ui';
import { getInventoryOverview } from '@/server/modules/inventory/overview';
import {
  displayCurrency,
  openDocumentCaption,
  parseSoldPeriod,
  soldPeriodRange,
} from '@/lib/inventory-overview';
import { InventoryOverviewShell, OverviewCard, SoldPeriodSelect } from './overview-chrome';

export const metadata = { title: 'Inventory overview · SkyJet' };

export default async function InventoryHomePage({
  searchParams,
}: {
  searchParams: Promise<{ sold?: string }>;
}) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const manage = can(session, entity.entityId, Permission.MastersManageItems);
  const readStock = can(session, entity.entityId, Permission.InvRead);
  const mayAdjust = can(session, entity.entityId, Permission.InvAdjustStock);
  const mayTransfer = can(session, entity.entityId, Permission.InvManageStock);
  const maySales = can(session, entity.entityId, Permission.SalesInvoiceCreate);
  const mayPurchase = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayReceive = can(session, entity.entityId, Permission.ProcurementPurchaseReceive);
  const mayReports = can(session, entity.entityId, Permission.ReportsView);

  if (!manage && !readStock) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (masters.manage_items or inv.read required)',
    );
  }

  const params = await searchParams;
  const soldPeriod = parseSoldPeriod(params.sold);
  const range = soldPeriodRange(soldPeriod);
  const currency = displayCurrency(entity.baseCurrency);

  const data = await getInventoryOverview(context, {
    from: range.from,
    to: range.to,
    includeStock: manage || readStock,
    includeSales: maySales,
    includePurchasing: mayPurchase,
  });

  return (
    <InventoryOverviewShell
      primaryActions={[
        { label: 'Add product or service', href: '/inventory/products', allowed: manage },
        { label: 'Create sales order', href: '/sales/orders/new', allowed: maySales },
        { label: 'Create purchase order', href: '/purchasing/orders/new', allowed: mayPurchase },
        { label: 'Adjust inventory', href: '/inventory/adjustments/new', allowed: mayAdjust },
        { label: 'Buy shipping label', disabled: true },
      ]}
      moreActions={[
        { label: 'Transfer stock', href: '/inventory/transfers/new', allowed: mayTransfer },
        { label: 'Create item receipt', href: '/purchasing/receipts/new', allowed: mayReceive },
        { label: 'Add category', href: '/inventory/categories', allowed: manage },
        { label: 'Add warehouse', href: '/inventory/warehouses', allowed: manage },
      ]}
    >
      <OverviewCard id="lowStock">
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Low on stock</h3>
            <span className="inv-widget__when">As of today</span>
          </header>
          <StatBlock figure={String(data.lowStock.total)} label="Low on stock" tone="warn" />
          <StockTable
            rows={data.lowStock.rows}
            empty="Nothing is below its reorder point."
            canReorder={mayPurchase}
          />
          <footer className="inv-widget__footer">
            <Link href="/inventory/stock?alert=low">View all low on stock</Link>
          </footer>
        </article>
      </OverviewCard>

      <OverviewCard id="outOfStock">
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Out of stock</h3>
            <span className="inv-widget__when">As of today</span>
          </header>
          <StatBlock figure={String(data.outOfStock.total)} label="Out of stock" tone="bad" />
          <StockTable
            rows={data.outOfStock.rows}
            empty="No stocked items are at zero."
            canReorder={mayPurchase}
          />
          <footer className="inv-widget__footer">
            <Link href="/inventory/stock?alert=out">View all out of stock</Link>
          </footer>
        </article>
      </OverviewCard>

      <OverviewCard id="topSelling">
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Top selling products</h3>
            <SoldPeriodSelect value={soldPeriod} />
          </header>
          {data.topSelling.length === 0 ? (
            <p className="inv-widget__empty">Data appears once it&apos;s available.</p>
          ) : (
            <div className="inv-widget__table-wrap">
              <table className="inv-widget-table">
                <thead>
                  <tr>
                    <th>Product name</th>
                    <th className="numeric">Qty sold</th>
                    <th className="numeric">Sales</th>
                    <th className="numeric">COS</th>
                    <th className="numeric">Gross profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSelling.map((row) => (
                    <tr key={row.id}>
                      <td>{row.productName}</td>
                      <td className="numeric">
                        <Quantity value={row.qtySold} />
                      </td>
                      <td className="numeric">
                        <Amount value={row.sales} />
                      </td>
                      <td className="numeric">
                        <Amount value={row.cos} />
                      </td>
                      <td className="numeric">
                        <Amount value={row.grossProfit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="inv-widget__footer">
            {mayReports ? (
              <Link href="/reports/sales-by-product">View sales by products report</Link>
            ) : (
              <span className="inv-report-list__soon" title="Reports permission required">
                View sales by products report
              </span>
            )}
          </footer>
        </article>
      </OverviewCard>

      <OverviewCard id="openSalesOrders">
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Open sales orders</h3>
            <span className="inv-widget__when">As of today</span>
          </header>
          <StatBlock
            figure={<Amount value={data.openSalesOrders.total} currency={currency} showCurrency />}
            label={openDocumentCaption('sales order', data.openSalesOrders.count)}
          />
          <DocumentTable
            numberLabel="SO no."
            partyLabel="Customer"
            rows={data.openSalesOrders.rows}
            empty="Data appears once it's available."
            currency={currency}
          />
          <footer className="inv-widget__footer">
            {maySales ? (
              <Link href="/sales/orders/new">Create sales order</Link>
            ) : (
              <Link href="/sales/orders">View sales orders</Link>
            )}
          </footer>
        </article>
      </OverviewCard>

      <OverviewCard id="openPurchaseOrders" wide>
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Open purchase orders</h3>
            <span className="inv-widget__when">As of today</span>
          </header>
          <StatBlock
            figure={
              <Amount value={data.openPurchaseOrders.total} currency={currency} showCurrency />
            }
            label={openDocumentCaption('purchase order', data.openPurchaseOrders.count)}
          />
          <DocumentTable
            numberLabel="PO no."
            partyLabel="Supplier"
            rows={data.openPurchaseOrders.rows}
            hrefFor={(id) => `/purchasing/orders/${id}`}
            empty="Data appears once it's available."
            currency={currency}
          />
          <footer className="inv-widget__footer">
            <Link href="/purchasing/orders">View all purchase orders</Link>
          </footer>
        </article>
      </OverviewCard>

      <OverviewCard id="reports" wide>
        <article className="inv-widget">
          <header className="inv-widget__head">
            <h3>Inventory reports</h3>
          </header>
          <ul className="inv-report-list">
            {reportLinks({ manage, readStock, maySales, mayReports }).map((report) => (
              <li key={report.label}>
                <span>{report.label}</span>
                {report.href ? (
                  <Link href={report.href}>View</Link>
                ) : (
                  <span className="inv-report-list__soon" title="Not yet built">
                    View
                  </span>
                )}
              </li>
            ))}
          </ul>
          <footer className="inv-widget__footer">
            <Link href={mayReports ? '/reports' : '/inventory/stock'}>View standard reports</Link>
          </footer>
        </article>
      </OverviewCard>
    </InventoryOverviewShell>
  );
}

function StatBlock({
  figure,
  label,
  tone = 'neutral',
}: {
  figure: ReactNode;
  label: string;
  tone?: 'neutral' | 'warn' | 'bad';
}) {
  return (
    <div className={`inv-stat inv-stat--${tone}`}>
      <p className="inv-stat__figure">{figure}</p>
      <p className="inv-stat__caption">
        {tone === 'bad' ? (
          <WarningMark />
        ) : (
          <span className={`inv-stat__pip inv-stat__pip--${tone}`} />
        )}
        {label}
      </p>
    </div>
  );
}

function StockTable({
  rows,
  empty,
  canReorder,
}: {
  rows: ReadonlyArray<{
    id: string;
    partNumber: string;
    description: string;
    qtyOnHand: string;
    reorderQuantity: string | null;
  }>;
  empty: string;
  canReorder: boolean;
}) {
  if (rows.length === 0) {
    return <p className="inv-widget__empty">{empty}</p>;
  }
  return (
    <div className="inv-widget__table-wrap">
      <table className="inv-widget-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="numeric">Qty</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const qty = row.reorderQuantity
              ? `&qty=${encodeURIComponent(row.reorderQuantity)}`
              : '';
            return (
              <tr key={row.id}>
                <td>
                  <Link href={`/inventory/items/${row.id}/edit`}>{row.description}</Link>
                </td>
                <td className="numeric">
                  <Quantity value={row.qtyOnHand} />
                </td>
                <td>
                  {canReorder ? (
                    <Link href={`/purchasing/orders/new?itemId=${row.id}${qty}`}>Reorder</Link>
                  ) : (
                    <span className="cell-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocumentTable({
  numberLabel,
  partyLabel,
  rows,
  hrefFor,
  empty,
  currency,
}: {
  numberLabel: string;
  partyLabel: string;
  rows: ReadonlyArray<{
    id: string;
    number: string;
    party: string;
    amount: string;
    currencyCode: string;
  }>;
  hrefFor?: (id: string) => string;
  empty: string;
  currency: string;
}) {
  return (
    <div className="inv-widget__table-wrap">
      <table className="inv-widget-table">
        <thead>
          <tr>
            <th>{numberLabel}</th>
            <th>{partyLabel}</th>
            <th className="numeric">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="inv-widget__empty-cell">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="cell-code">
                  {hrefFor ? <Link href={hrefFor(row.id)}>{row.number}</Link> : row.number}
                </td>
                <td>{row.party}</td>
                <td className="numeric">
                  <Amount
                    value={row.amount}
                    currency={displayCurrency(row.currencyCode) || currency}
                    showCurrency
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function reportLinks(access: {
  manage: boolean;
  readStock: boolean;
  maySales: boolean;
  mayReports: boolean;
}) {
  return [
    {
      label: 'Inventory valuation summary',
      href: access.readStock || access.manage ? '/inventory/stock' : undefined,
    },
    {
      label: 'Inventory valuation detail',
      href: access.readStock ? '/inventory/ledger' : undefined,
    },
    {
      label: 'Stock take worksheet',
      href: access.readStock || access.manage ? '/inventory/stock' : undefined,
    },
    {
      label: 'Products and services list',
      href: access.manage ? '/inventory/products' : undefined,
    },
    {
      label: 'Sales by products — Summary',
      href: access.mayReports ? '/reports/sales-by-product' : undefined,
    },
    {
      label: 'Open sales order by item',
      href: access.maySales ? '/sales/orders' : undefined,
    },
    {
      label: 'Open sales order by customer',
      href: access.maySales ? '/sales/orders' : undefined,
    },
  ];
}

function WarningMark() {
  return (
    <svg className="inv-stat__warn" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.6 2.8 20.2h18.4L12 3.6Z"
        fill="var(--negative-tint)"
        stroke="var(--negative)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 9.2v5.2" stroke="var(--negative)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.8" r="0.9" fill="var(--negative)" />
    </svg>
  );
}
