import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listPurchaseOrders, listSuppliersForSelect } from '@/server/modules/purchasing/documents';
import { Amount, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { documentPdfPath } from '@/lib/documents/href';
import { formatDisplayDate, nairobiToday, toCsv } from '@/lib/payables';
import {
  PO_LIST_COLUMNS,
  PO_LIST_PAGE_SIZE,
  parsePoListQuery,
  poListQueryString,
  poListSortHref,
  poPagerLabel,
  purchaseOrderDateBounds,
  purchaseOrderDateChip,
  purchaseOrderHref,
  purchaseOrderStatusLabel,
  supplierDetailHref,
} from '@/lib/purchase-orders';
import { ColumnTable } from '../column-table';
import { BoxedPager, PageFeedback, RowAction } from '@/components/lists/list-chrome';
import { PoFilters } from './po-filters';
import { PoListRow } from './po-list-row';

export const metadata = { title: 'Purchase orders · SkyJet' };

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { context, session, entity } = await authorise(Permission.ProcurementPurchaseCreate);
  const params = await searchParams;
  const query = parsePoListQuery(params);
  const today = nairobiToday();
  const bounds = purchaseOrderDateBounds(query.range, today);
  const mayCreate = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayPay = can(session, entity.entityId, Permission.FinancePaymentCreate);

  const [list, suppliers] = await Promise.all([
    listPurchaseOrders(context, {
      from: bounds.from,
      to: bounds.to,
      supplierId: query.supplierId,
      sort: query.sort,
      dir: query.dir,
      limit: PO_LIST_PAGE_SIZE,
      offset: (query.page - 1) * PO_LIST_PAGE_SIZE,
    }),
    listSuppliersForSelect(context),
  ]);

  const lastPage = Math.max(1, Math.ceil(list.total / PO_LIST_PAGE_SIZE));
  const pagerParams: Record<string, string> = {};
  const encoded = poListQueryString({ ...query, page: 1 }).replace(/^\?/, '');
  if (encoded) {
    new URLSearchParams(encoded).forEach((value, key) => {
      pagerParams[key] = value;
    });
  }

  const csv = toCsv([
    PO_LIST_COLUMNS.filter((column) => column.id !== 'action').map((column) => column.label),
    ...list.rows.map((po) => [
      po.supplier_name,
      po.po_no ?? 'Draft',
      formatDisplayDate(po.order_date),
      po.category ?? '',
      '',
      po.location ?? '',
      po.notes ?? '',
      po.subtotal,
      po.tax_total,
      po.total,
      po.expected_date ? formatDisplayDate(po.expected_date) : '',
      purchaseOrderStatusLabel(po.status),
      po.supplier_email ?? '',
      '',
      po.attachments === '0' ? '' : po.attachments,
    ]),
  ]);

  const dateChip = purchaseOrderDateChip(bounds.from, bounds.to);
  const supplierName = query.supplierId
    ? suppliers.find((supplier) => supplier.id === query.supplierId)?.legal_name
    : undefined;
  const dateSortHref = poListSortHref(query, 'date');

  return (
    <>
      <PageHeader
        title="Purchase orders"
        actions={
          <>
            <PageFeedback />
            {mayCreate ? (
              <Link href="/purchasing/orders/new" className="button button--primary">
                Add purchase order
              </Link>
            ) : null}
          </>
        }
      />

      {list.hasAny ? <PoFilters query={query} suppliers={suppliers} /> : null}

      {list.hasAny && (dateChip || supplierName) ? (
        <div className="filter-chips">
          {dateChip ? (
            <span className="filter-chip">
              {dateChip}
              <Link
                href={`/purchasing/orders${poListQueryString({
                  ...query,
                  range: 'all',
                  page: 1,
                })}`}
                aria-label="Clear date filter"
              >
                ×
              </Link>
            </span>
          ) : null}
          {supplierName && query.supplierId ? (
            <span className="filter-chip">
              Supplier: {supplierName}
              <Link
                href={`/purchasing/orders${poListQueryString({
                  ...query,
                  supplierId: undefined,
                  page: 1,
                })}`}
                aria-label="Clear supplier filter"
              >
                ×
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}

      <Card>
        {!list.hasAny ? (
          <EmptyState
            title="No purchase orders yet"
            description="Supplier commitments. Approving allocates a PO number; the ledger is unchanged until goods are received or billed."
            action={
              mayCreate ? (
                <Link href="/purchasing/orders/new" className="button button--primary">
                  Add purchase order
                </Link>
              ) : null
            }
          />
        ) : (
          <ColumnTable
            tableId="purchase-orders"
            filename="purchase-orders.csv"
            csv={csv}
            columns={[...PO_LIST_COLUMNS]}
          >
            {list.rows.length === 0 ? (
              <EmptyState
                title="No results found"
                description="Remove some filters or try a different date range."
              />
            ) : (
              <DataTable dense>
                <thead>
                  <tr>
                    <th data-col="supplier">Supplier</th>
                    <th data-col="no">Order no.</th>
                    <th
                      data-col="date"
                      aria-sort={
                        query.sort === 'date'
                          ? query.dir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      <Link href={dateSortHref} className="th-sort">
                        Order date
                        {query.sort === 'date' ? (
                          <span aria-hidden="true">{query.dir === 'asc' ? ' ↑' : ' ↓'}</span>
                        ) : null}
                      </Link>
                    </th>
                    <th data-col="category">Category</th>
                    <th data-col="class">Class</th>
                    <th data-col="location">Location</th>
                    <th data-col="memo">Memo</th>
                    <th className="numeric" data-col="pretax">
                      Total before sales tax
                    </th>
                    <th className="numeric" data-col="tax">
                      Sales tax
                    </th>
                    <th className="numeric" data-col="amount">
                      Total amount
                    </th>
                    <th data-col="due">Due date</th>
                    <th data-col="status">Status</th>
                    <th data-col="email">Email</th>
                    <th data-col="lastEmail">
                      <span className="th-info">
                        Last email sent
                        <span
                          className="th-info__icon"
                          title="Last time this purchase order was emailed. Email send history is not kept in this version."
                        >
                          i
                        </span>
                      </span>
                    </th>
                    <th data-col="attachments">Attachments</th>
                    <th data-col="action">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((po) => (
                    <PoListRow key={po.id} href={purchaseOrderHref(po.id)}>
                      <td data-col="supplier">
                        <Link href={supplierDetailHref(po.supplier_id)}>{po.supplier_name}</Link>
                      </td>
                      <td data-col="no">
                        <Link href={purchaseOrderHref(po.id)}>{po.po_no ?? 'Draft'}</Link>
                      </td>
                      <td data-col="date">{formatDisplayDate(po.order_date)}</td>
                      <td data-col="category">{po.category ?? ''}</td>
                      <td data-col="class" />
                      <td data-col="location">{po.location ?? ''}</td>
                      <td data-col="memo">{po.notes ?? ''}</td>
                      <td className="numeric" data-col="pretax">
                        <Amount value={po.subtotal} currency={po.currency_code} showCurrency />
                      </td>
                      <td className="numeric" data-col="tax">
                        <Amount value={po.tax_total} currency={po.currency_code} showCurrency />
                      </td>
                      <td className="numeric" data-col="amount">
                        <Amount value={po.total} currency={po.currency_code} showCurrency />
                      </td>
                      <td data-col="due">
                        {po.expected_date ? formatDisplayDate(po.expected_date) : ''}
                      </td>
                      <td data-col="status">{purchaseOrderStatusLabel(po.status)}</td>
                      <td className="cell-truncate" data-col="email">
                        {po.supplier_email ?? ''}
                      </td>
                      <td data-col="lastEmail" />
                      <td data-col="attachments">{po.attachments === '0' ? '' : po.attachments}</td>
                      <td data-col="action">
                        <RowAction
                          label="View/edit"
                          href={purchaseOrderHref(po.id)}
                          items={[
                            { label: 'View/edit', href: purchaseOrderHref(po.id) },
                            { label: 'Print', href: documentPdfPath('purchase-order', po.id) },
                            ...(mayPay
                              ? [
                                  {
                                    label: 'Create bill',
                                    href: `/purchasing/bills/new?supplierId=${po.supplier_id}`,
                                  },
                                ]
                              : []),
                            ...(mayCreate
                              ? [
                                  {
                                    label: 'Copy',
                                    href: `/purchasing/orders/new?supplierId=${po.supplier_id}`,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    </PoListRow>
                  ))}
                </tbody>
              </DataTable>
            )}
          </ColumnTable>
        )}
        {list.hasAny ? (
          <div className="list-pager list-pager--end">
            <BoxedPager
              label={poPagerLabel(list.total, query.page, PO_LIST_PAGE_SIZE)}
              page={query.page}
              lastPage={lastPage}
              pathname="/purchasing/orders"
              params={pagerParams}
            />
          </div>
        ) : null}
      </Card>
    </>
  );
}
