import {
  withReadOnlyTransaction,
  type RequestContext,
  type Transaction,
} from '@/server/db/transaction';

export type StockAlertRow = {
  id: string;
  partNumber: string;
  description: string;
  qtyOnHand: string;
  reorderQuantity: string | null;
};

export type TopSellingRow = {
  id: string;
  productName: string;
  qtySold: string;
  sales: string;
  cos: string;
  grossProfit: string;
};

export type OpenDocumentRow = {
  id: string;
  number: string;
  party: string;
  amount: string;
  currencyCode: string;
};

export type InventoryOverview = {
  lowStock: { total: number; rows: StockAlertRow[] };
  outOfStock: { total: number; rows: StockAlertRow[] };
  topSelling: TopSellingRow[];
  openSalesOrders: { count: number; total: string; rows: OpenDocumentRow[] };
  openPurchaseOrders: { count: number; total: string; rows: OpenDocumentRow[] };
};

const EMPTY_DOCS = { count: 0, total: '0', rows: [] as OpenDocumentRow[] };

function emptyOverview(): InventoryOverview {
  return {
    lowStock: { total: 0, rows: [] },
    outOfStock: { total: 0, rows: [] },
    topSelling: [],
    openSalesOrders: EMPTY_DOCS,
    openPurchaseOrders: EMPTY_DOCS,
  };
}

async function stockAlerts(tx: Transaction, entityId: string, kind: 'low' | 'out', limit: number) {
  const predicate =
    kind === 'out' ? `qty <= 0` : `qty > 0 and reorder_point is not null and qty <= reorder_point`;

  const rows = await tx.query<{
    id: string;
    part_number: string;
    description: string;
    qty_on_hand: string;
    reorder_quantity: string | null;
    total_count: string;
  }>(
    `with on_hand as (
        select i.id,
               i.part_number,
               i.description,
               i.reorder_point,
               i.reorder_quantity,
               coalesce((
                 select sum(b.quantity_on_hand)
                   from inv.stock_balances b
                  where b.item_id = i.id
                    and b.entity_id = i.entity_id
               ), 0) as qty
          from inv.items i
         where i.entity_id = $1
           and i.is_stocked
           and i.is_active
      )
      select id,
             part_number,
             description,
             qty::text as qty_on_hand,
             reorder_quantity::text as reorder_quantity,
             count(*) over()::text as total_count
        from on_hand
       where ${predicate}
       order by qty asc, part_number
       limit $2`,
    [entityId, limit],
  );

  return {
    total: Number(rows[0]?.total_count ?? 0),
    rows: rows.map((row) => ({
      id: row.id,
      partNumber: row.part_number,
      description: row.description,
      qtyOnHand: row.qty_on_hand,
      reorderQuantity: row.reorder_quantity,
    })),
  };
}

export async function getInventoryOverview(
  context: RequestContext,
  options: {
    from: string;
    to: string;
    includeStock: boolean;
    includeSales: boolean;
    includePurchasing: boolean;
  },
): Promise<InventoryOverview> {
  if (!options.includeStock && !options.includeSales && !options.includePurchasing) {
    return emptyOverview();
  }

  return withReadOnlyTransaction(context, async (tx) => {
    const overview = emptyOverview();

    if (options.includeStock) {
      overview.lowStock = await stockAlerts(tx, context.entityId, 'low', 5);
      overview.outOfStock = await stockAlerts(tx, context.entityId, 'out', 5);
    }

    if (options.includeSales) {
      const sold = await tx.query<{
        id: string;
        product_name: string;
        qty_sold: string;
        sales: string;
        cos: string;
        gross_profit: string;
      }>(
        `select coalesce(g.item_id::text, g.product_name) as id,
                g.product_name,
                g.quantity::text as qty_sold,
                g.amount::text as sales,
                g.cos::text,
                (g.amount - g.cos)::text as gross_profit
           from sales.sales_by_product_summary($1::uuid, $2::date, $3::date, 'ACCRUAL'::text) g
          order by g.amount desc, g.product_name
          limit 8`,
        [context.entityId, options.from, options.to],
      );
      overview.topSelling = sold.map((row) => ({
        id: row.id,
        productName: row.product_name,
        qtySold: row.qty_sold,
        sales: row.sales,
        cos: row.cos,
        grossProfit: row.gross_profit,
      }));

      const soAgg = await tx.one<{ count: string; total: string }>(
        `select count(*)::text as count,
                coalesce(sum(total), 0)::text as total
           from sales.sales_orders
          where entity_id = $1
            and status = 'CONFIRMED'
            and converted_invoice_id is null`,
        [context.entityId],
      );
      const soRows = await tx.query<{
        id: string;
        doc_no: string;
        party: string;
        amount: string;
        currency_code: string;
      }>(
        `select o.id,
                coalesce(o.order_no, 'Draft') as doc_no,
                c.legal_name as party,
                o.total::text as amount,
                o.currency_code
           from sales.sales_orders o
           join app.customers c on c.id = o.customer_id
          where o.entity_id = $1
            and o.status = 'CONFIRMED'
            and o.converted_invoice_id is null
          order by o.order_date desc, o.created_at desc
          limit 5`,
        [context.entityId],
      );
      overview.openSalesOrders = {
        count: Number(soAgg.count),
        total: soAgg.total,
        rows: soRows.map((row) => ({
          id: row.id,
          number: row.doc_no,
          party: row.party,
          amount: row.amount,
          currencyCode: row.currency_code,
        })),
      };
    }

    if (options.includePurchasing) {
      const poAgg = await tx.one<{ count: string; total: string }>(
        `with remaining as (
            select p.id,
                   p.currency_code,
                   sum(
                     pl.line_net * greatest(pl.quantity - coalesce(rec.qty, 0), 0) / pl.quantity
                   ) as leftover
              from purch.purchase_orders p
              join purch.purchase_order_lines pl on pl.po_id = p.id
              left join lateral (
                select sum(gl.quantity) as qty
                  from purch.goods_receipt_lines gl
                  join purch.goods_receipts g on g.id = gl.goods_receipt_id
                 where gl.po_line_id = pl.id
                   and g.status = 'POSTED'
              ) rec on true
             where p.entity_id = $1
               and p.status = 'APPROVED'
             group by p.id, p.currency_code
            having sum(greatest(pl.quantity - coalesce(rec.qty, 0), 0)) > 0
          )
          select count(*)::text as count,
                 coalesce(sum(leftover), 0)::text as total
            from remaining`,
        [context.entityId],
      );
      const poRows = await tx.query<{
        id: string;
        doc_no: string;
        party: string;
        amount: string;
        currency_code: string;
      }>(
        `with remaining as (
            select p.id,
                   coalesce(p.po_no, 'Draft') as doc_no,
                   s.legal_name as party,
                   p.currency_code,
                   p.order_date,
                   p.created_at,
                   sum(
                     pl.line_net * greatest(pl.quantity - coalesce(rec.qty, 0), 0) / pl.quantity
                   ) as leftover
              from purch.purchase_orders p
              join app.suppliers s on s.id = p.supplier_id
              join purch.purchase_order_lines pl on pl.po_id = p.id
              left join lateral (
                select sum(gl.quantity) as qty
                  from purch.goods_receipt_lines gl
                  join purch.goods_receipts g on g.id = gl.goods_receipt_id
                 where gl.po_line_id = pl.id
                   and g.status = 'POSTED'
              ) rec on true
             where p.entity_id = $1
               and p.status = 'APPROVED'
             group by p.id, p.po_no, s.legal_name, p.currency_code, p.order_date, p.created_at
            having sum(greatest(pl.quantity - coalesce(rec.qty, 0), 0)) > 0
          )
          select id, doc_no, party, leftover::text as amount, currency_code
            from remaining
           order by order_date desc, created_at desc
           limit 5`,
        [context.entityId],
      );
      overview.openPurchaseOrders = {
        count: Number(poAgg.count),
        total: poAgg.total,
        rows: poRows.map((row) => ({
          id: row.id,
          number: row.doc_no,
          party: row.party,
          amount: row.amount,
          currencyCode: row.currency_code,
        })),
      };
    }

    return overview;
  });
}

export async function listStockAlerts(
  context: RequestContext,
  kind: 'low' | 'out',
): Promise<{ total: number; rows: StockAlertRow[] }> {
  return withReadOnlyTransaction(context, async (tx) =>
    stockAlerts(tx, context.entityId, kind, 200),
  );
}
