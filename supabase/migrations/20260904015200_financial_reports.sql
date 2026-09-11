-- ===========================================================================
-- Financial reports
--
-- Profit & loss, balance sheet and aged receivables — read-side helpers that
-- sit on gl.journal_entry_line and sales invoice balances. Same patterns as
-- gl.trial_balance / gl.account_balance_as_at: stable SQL, no DML.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- gl.profit_and_loss
--
-- Period movement for REVENUE and EXPENSE accounts.
-- amount is the signed contribution magnitude in the account's normal sense:
--   REVENUE  → credit_base - debit_base  (credits positive)
--   EXPENSE  → debit_base  - credit_base (debits positive)
-- Net income for the period is sum(revenue amounts) - sum(expense amounts).
-- ---------------------------------------------------------------------------

create or replace function gl.profit_and_loss(
  p_entity_id uuid,
  p_from      date,
  p_to        date
)
returns table (
  account_id   uuid,
  code         text,
  name         text,
  account_type gl.account_type,
  amount       app.money_amount
)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select
    a.id,
    a.code,
    a.name,
    a.account_type,
    case a.account_type
      when 'REVENUE' then coalesce(sum(l.credit_base - l.debit_base), 0)
      when 'EXPENSE' then coalesce(sum(l.debit_base  - l.credit_base), 0)
    end::app.money_amount as amount
  from gl.accounts a
  join gl.journal_entry_line l
    on l.account_id = a.id
   and l.entity_id = a.entity_id
  where a.entity_id = p_entity_id
    and a.account_type in ('REVENUE', 'EXPENSE')
    and l.entry_date between p_from and p_to
  group by a.id, a.code, a.name, a.account_type
  having coalesce(sum(l.debit_base), 0) <> 0
      or coalesce(sum(l.credit_base), 0) <> 0
  order by a.account_type, a.code;
$$;

comment on function gl.profit_and_loss(uuid, date, date) is
  'Period P&L by account. Revenue amount = credit−debit; expense amount = debit−credit.';

-- ---------------------------------------------------------------------------
-- gl.balance_sheet
--
-- Closing balances for ASSET / LIABILITY / EQUITY as at p_as_at.
--   ASSET              → debit_base - credit_base
--   LIABILITY, EQUITY  → credit_base - debit_base
-- ---------------------------------------------------------------------------

create or replace function gl.balance_sheet(
  p_entity_id uuid,
  p_as_at     date
)
returns table (
  account_id   uuid,
  code         text,
  name         text,
  account_type gl.account_type,
  amount       app.money_amount
)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select
    a.id,
    a.code,
    a.name,
    a.account_type,
    case a.account_type
      when 'ASSET' then coalesce(sum(l.debit_base - l.credit_base), 0)
      else              coalesce(sum(l.credit_base - l.debit_base), 0)
    end::app.money_amount as amount
  from gl.accounts a
  join gl.journal_entry_line l
    on l.account_id = a.id
   and l.entity_id = a.entity_id
  where a.entity_id = p_entity_id
    and a.account_type in ('ASSET', 'LIABILITY', 'EQUITY')
    and l.entry_date <= p_as_at
  group by a.id, a.code, a.name, a.account_type
  having case a.account_type
           when 'ASSET' then coalesce(sum(l.debit_base - l.credit_base), 0)
           else              coalesce(sum(l.credit_base - l.debit_base), 0)
         end <> 0
  order by a.account_type, a.code;
$$;

comment on function gl.balance_sheet(uuid, date) is
  'Balance sheet as at a date. Assets are debit−credit; liabilities and equity are credit−debit.';

-- ---------------------------------------------------------------------------
-- sales.aged_receivables
--
-- Open issued invoices aged by days past due as of p_as_at.
-- Buckets: current, 1-30, 31-60, 61-90, 90+
-- Outstanding respects receipts posted on or before p_as_at.
-- ---------------------------------------------------------------------------

create or replace function sales.aged_receivables(
  p_entity_id uuid,
  p_as_at     date default current_date
)
returns table (
  customer_id   uuid,
  customer_code text,
  customer_name text,
  invoice_id    uuid,
  invoice_no    text,
  invoice_date  date,
  due_date      date,
  total         app.money_amount,
  outstanding   app.money_amount,
  bucket        text
)
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  with open_invoices as (
    select
      i.id as invoice_id,
      i.customer_id,
      i.invoice_no,
      i.invoice_date,
      i.due_date,
      i.total,
      (i.total - coalesce((
        select sum(a.amount)
          from sales.receipt_allocations a
          join sales.receipts r on r.id = a.receipt_id
         where a.invoice_id = i.id
           and r.status = 'POSTED'
           and r.receipt_date <= p_as_at
      ), 0))::app.money_amount as outstanding
    from sales.invoices i
   where i.entity_id = p_entity_id
     and i.status = 'ISSUED'
     and i.invoice_date <= p_as_at
  )
  select
    c.id,
    c.code,
    c.legal_name,
    o.invoice_id,
    o.invoice_no,
    o.invoice_date,
    o.due_date,
    o.total,
    o.outstanding,
    case
      when o.due_date >= p_as_at then 'current'
      when (p_as_at - o.due_date) between 1 and 30 then '1-30'
      when (p_as_at - o.due_date) between 31 and 60 then '31-60'
      when (p_as_at - o.due_date) between 61 and 90 then '61-90'
      else '90+'
    end as bucket
  from open_invoices o
  join app.customers c on c.id = o.customer_id
  where o.outstanding > 0
  order by c.code, o.due_date, o.invoice_no;
$$;

comment on function sales.aged_receivables(uuid, date) is
  'Open AR invoices aged by days past due as of the report date. Buckets: current, 1-30, 31-60, 61-90, 90+.';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant execute on function
  gl.profit_and_loss(uuid, date, date),
  gl.balance_sheet(uuid, date),
  sales.aged_receivables(uuid, date)
to skyjet_app, authenticated;
