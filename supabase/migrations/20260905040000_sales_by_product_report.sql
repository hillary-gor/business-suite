-- Sales by Product/Service Summary. Accrual uses issued invoices, posted
-- sales receipts and posted credit notes in the date range. Cash uses
-- receipts posted in the range (sales receipts in full; invoice receipts
-- attributed to lines in proportion to the invoice total).

set search_path = pg_catalog, public, extensions;

create or replace function sales.sales_by_product_summary(
  p_entity_id uuid,
  p_from      date,
  p_to        date,
  p_basis     text default 'ACCRUAL'
)
returns table (
  item_id        uuid,
  category_id    uuid,
  category_name  text,
  product_name   text,
  quantity       app.quantity,
  amount         app.money_amount,
  cos            app.money_amount
)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  with paid as (
    select a.invoice_id, sum(a.amount) as paid
      from sales.receipt_allocations a
      join sales.receipts r on r.id = a.receipt_id
     where r.entity_id = p_entity_id
       and r.status = 'POSTED'
       and r.receipt_date between p_from and p_to
     group by a.invoice_id
  ),
  accrual_lines as (
    select l.item_id,
           coalesce(i.description, l.description) as product_name,
           c.id as category_id,
           c.name as category_name,
           l.quantity as qty,
           l.line_net as amount
      from sales.invoice_lines l
      join sales.invoices inv on inv.id = l.invoice_id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where inv.entity_id = p_entity_id
       and inv.status = 'ISSUED'
       and inv.invoice_date between p_from and p_to
    union all
    select l.item_id,
           coalesce(i.description, l.description),
           c.id,
           c.name,
           l.quantity,
           l.line_net
      from sales.sales_receipt_lines l
      join sales.sales_receipts r on r.id = l.sales_receipt_id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where r.entity_id = p_entity_id
       and r.status = 'POSTED'
       and r.receipt_date between p_from and p_to
    union all
    select l.item_id,
           coalesce(i.description, l.description),
           c.id,
           c.name,
           -l.quantity,
           -l.line_net
      from sales.credit_note_lines l
      join sales.credit_notes n on n.id = l.credit_note_id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where n.entity_id = p_entity_id
       and n.status = 'POSTED'
       and n.credit_date between p_from and p_to
  ),
  cash_lines as (
    select l.item_id,
           coalesce(i.description, l.description) as product_name,
           c.id as category_id,
           c.name as category_name,
           l.quantity * (p.paid / nullif(inv.total, 0)) as qty,
           l.line_net * (p.paid / nullif(inv.total, 0)) as amount
      from sales.invoice_lines l
      join sales.invoices inv on inv.id = l.invoice_id
      join paid p on p.invoice_id = inv.id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where inv.entity_id = p_entity_id
       and inv.status = 'ISSUED'
    union all
    select l.item_id,
           coalesce(i.description, l.description),
           c.id,
           c.name,
           l.quantity,
           l.line_net
      from sales.sales_receipt_lines l
      join sales.sales_receipts r on r.id = l.sales_receipt_id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where r.entity_id = p_entity_id
       and r.status = 'POSTED'
       and r.receipt_date between p_from and p_to
    union all
    select l.item_id,
           coalesce(i.description, l.description),
           c.id,
           c.name,
           -l.quantity,
           -l.line_net
      from sales.credit_note_lines l
      join sales.credit_notes n on n.id = l.credit_note_id
      left join inv.items i on i.id = l.item_id
      left join inv.item_categories c on c.id = i.category_id
     where n.entity_id = p_entity_id
       and n.status = 'POSTED'
       and n.credit_date between p_from and p_to
  ),
  lines as (
    select * from accrual_lines where upper(coalesce(p_basis, 'ACCRUAL')) = 'ACCRUAL'
    union all
    select * from cash_lines where upper(coalesce(p_basis, 'ACCRUAL')) = 'CASH'
  ),
  grouped as (
    select item_id,
           category_id,
           category_name,
           product_name,
           sum(qty) as quantity,
           sum(amount) as amount
      from lines
     group by item_id, category_id, category_name, product_name
  ),
  accrual_cos as (
    select item_id, sum(cos) as cos
      from (
        select sl.item_id, sum(-sl.value_base) as cos
          from inv.stock_ledger sl
          join sales.invoices inv on inv.id = sl.source_id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_INVOICE'
           and inv.status = 'ISSUED'
           and inv.invoice_date between p_from and p_to
         group by sl.item_id
        union all
        select sl.item_id, sum(-sl.value_base)
          from inv.stock_ledger sl
          join sales.sales_receipts r on r.id = sl.source_id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_RECEIPT'
           and r.status = 'POSTED'
           and r.receipt_date between p_from and p_to
         group by sl.item_id
        union all
        select sl.item_id, sum(-sl.value_base)
          from inv.stock_ledger sl
          join sales.credit_notes n on n.id = sl.source_id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_CREDIT_NOTE'
           and n.status = 'POSTED'
           and n.credit_date between p_from and p_to
         group by sl.item_id
      ) x
     group by item_id
  ),
  cash_cos as (
    select item_id, sum(cos) as cos
      from (
        select sl.item_id, sum(-sl.value_base) as cos
          from inv.stock_ledger sl
          join sales.sales_receipts r on r.id = sl.source_id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_RECEIPT'
           and r.status = 'POSTED'
           and r.receipt_date between p_from and p_to
         group by sl.item_id
        union all
        select sl.item_id,
               sum(-sl.value_base) * (p.paid / nullif(inv.total, 0)) as cos
          from inv.stock_ledger sl
          join sales.invoices inv on inv.id = sl.source_id
          join paid p on p.invoice_id = inv.id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_INVOICE'
           and inv.status = 'ISSUED'
         group by sl.item_id, p.paid, inv.total
        union all
        select sl.item_id, sum(-sl.value_base) as cos
          from inv.stock_ledger sl
          join sales.credit_notes n on n.id = sl.source_id
         where sl.entity_id = p_entity_id
           and sl.source_type = 'SALES_CREDIT_NOTE'
           and n.status = 'POSTED'
           and n.credit_date between p_from and p_to
         group by sl.item_id
      ) x
     group by item_id
  ),
  cogs as (
    select * from accrual_cos where upper(coalesce(p_basis, 'ACCRUAL')) = 'ACCRUAL'
    union all
    select * from cash_cos where upper(coalesce(p_basis, 'ACCRUAL')) = 'CASH'
  )
  select g.item_id,
         g.category_id,
         g.category_name,
         g.product_name,
         g.quantity::app.quantity,
         g.amount::app.money_amount,
         coalesce(c.cos, 0)::app.money_amount as cos
    from grouped g
    left join cogs c on g.item_id is not null and c.item_id = g.item_id
   where g.quantity <> 0 or g.amount <> 0
   order by g.category_name nulls last, g.product_name;
$$;

comment on function sales.sales_by_product_summary(uuid, date, date, text) is
  'Sales by product for a date range. Amount is line net; COS is stock ledger cost of sales.';

grant execute on function sales.sales_by_product_summary(uuid, date, date, text) to skyjet_app, authenticated;
