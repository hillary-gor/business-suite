-- ===========================================================================
-- 0006_period_close_and_opening_balances.sql
--
-- Three things that only make sense once the ledger exists:
--
--   1. Closing a period, which is how a set of numbers stops being provisional
--      and becomes a statement the business stands behind.
--   2. Restating foreign currency balances at the closing rate, so that the
--      balance sheet reports what the business is actually owed and owes.
--   3. Bringing the QuickBooks balances across, which happens exactly once and
--      must be right, because everything afterwards is built on it.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Building the calendar
-- ---------------------------------------------------------------------------

create or replace function gl.create_fiscal_year(
  p_entity_id  uuid,
  p_start_date date,
  p_code       text default null,
  p_open_first boolean default false
)
returns uuid
language plpgsql
as $$
declare
  v_code       text;
  v_year_id    uuid;
  v_end_date   date := (p_start_date + interval '1 year' - interval '1 day')::date;
  v_period_start date;
  v_period_end   date;
  v_i          integer;
begin
  perform app.require_permission(p_entity_id, 'gl.manage_calendar');

  v_code := coalesce(p_code, 'FY' || extract(year from v_end_date)::text);

  insert into gl.fiscal_years (entity_id, code, start_date, end_date, status)
  values (p_entity_id, v_code, p_start_date, v_end_date, 'OPEN')
  returning id into v_year_id;

  -- Twelve calendar periods, plus a thirteenth adjustment period that occupies
  -- the final day. Audit adjustments land there instead of distorting the
  -- month the business actually traded in.
  for v_i in 1..12 loop
    v_period_start := (p_start_date + make_interval(months => v_i - 1))::date;
    v_period_end   := (p_start_date + make_interval(months => v_i) - interval '1 day')::date;

    if v_i = 12 then
      v_period_end := v_period_end - 1;
    end if;

    insert into gl.fiscal_periods (
      entity_id, fiscal_year_id, period_no, name, start_date, end_date, status
    )
    values (
      p_entity_id, v_year_id, v_i,
      to_char(v_period_start, 'Mon YYYY'),
      v_period_start, v_period_end,
      case when p_open_first and v_i = 1 then 'OPEN'::gl.period_status else 'FUTURE'::gl.period_status end
    );
  end loop;

  insert into gl.fiscal_periods (
    entity_id, fiscal_year_id, period_no, name, start_date, end_date, status
  )
  values (
    p_entity_id, v_year_id, 13,
    'Adjustments ' || to_char(v_end_date, 'YYYY'),
    v_end_date, v_end_date,
    'FUTURE'
  );

  return v_year_id;
end;
$$;

comment on function gl.create_fiscal_year(uuid, date, text, boolean) is
  'Creates a fiscal year with twelve trading periods and a thirteenth adjustment period on the final day.';

create or replace function gl.open_period(p_period_id uuid)
returns void
language plpgsql
as $$
declare
  v_period gl.fiscal_periods%rowtype;
begin
  select * into v_period from gl.fiscal_periods where id = p_period_id;
  if not found then
    raise exception 'Period % does not exist', p_period_id using errcode = 'no_data_found';
  end if;

  perform app.require_permission(v_period.entity_id, 'gl.manage_calendar');

  if v_period.status <> 'FUTURE' then
    raise exception 'Period % is % and cannot be opened from here', v_period.name, v_period.status
      using errcode = 'restrict_violation';
  end if;

  update gl.fiscal_periods set status = 'OPEN' where id = p_period_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing a period
-- ---------------------------------------------------------------------------

create table gl.period_close_snapshot (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references app.entities (id) on delete restrict,
  period_id     uuid not null references gl.fiscal_periods (id) on delete restrict,
  account_id    uuid not null references gl.accounts (id) on delete restrict,
  closing_base  app.money_amount not null,
  period_debit  app.money_amount not null,
  period_credit app.money_amount not null,
  captured_at   timestamptz not null default now(),
  close_seq     integer not null default 1,
  unique (period_id, account_id, close_seq)
);

comment on table gl.period_close_snapshot is
  'The balances as they stood at the moment the period was closed. If a period is reopened and re-closed, the earlier snapshot is kept and close_seq increments, so the change is visible.';

create table gl.period_reopen_log (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references app.entities (id) on delete restrict,
  period_id   uuid not null references gl.fiscal_periods (id) on delete restrict,
  reason      text not null check (length(btrim(reason)) > 0),
  reopened_at timestamptz not null default now(),
  reopened_by uuid not null references app.users (id)
);

comment on table gl.period_reopen_log is
  'Reopening a closed period is the single most sensitive action in the system. Every occurrence is recorded here permanently.';

select app.enable_append_only('gl.period_close_snapshot');
select app.enable_append_only('gl.period_reopen_log');

create or replace function gl.close_period(p_period_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_period    gl.fiscal_periods%rowtype;
  v_earlier   text;
  v_imbalance app.money_amount;
  v_seq       integer;
begin
  select * into v_period from gl.fiscal_periods where id = p_period_id for update;
  if not found then
    raise exception 'Period % does not exist', p_period_id using errcode = 'no_data_found';
  end if;

  perform app.require_permission(v_period.entity_id, 'gl.close_period');

  if v_period.status <> 'OPEN' then
    raise exception 'Period % is %, not OPEN', v_period.name, v_period.status
      using errcode = 'restrict_violation';
  end if;

  -- Periods close in order. Closing March while February is still open would
  -- leave a hole that later postings could fall into.
  select string_agg(name, ', ' order by start_date) into v_earlier
    from gl.fiscal_periods
   where entity_id = v_period.entity_id
     and end_date < v_period.start_date
     and status in ('FUTURE', 'OPEN');

  if v_earlier is not null then
    raise exception 'Cannot close %: the earlier period(s) % are still open', v_period.name, v_earlier
      using errcode = 'restrict_violation';
  end if;

  -- The books must balance before they are declared closed.
  select coalesce(sum(debit_base - credit_base), 0) into v_imbalance
    from gl.journal_entry_line
   where entity_id = v_period.entity_id
     and entry_date <= v_period.end_date;

  if v_imbalance <> 0 then
    raise exception
      'Cannot close %: the ledger is out of balance by % as at %. Investigate before closing.',
      v_period.name, v_imbalance, v_period.end_date
      using errcode = 'check_violation';
  end if;

  select coalesce(max(close_seq), 0) + 1 into v_seq
    from gl.period_close_snapshot where period_id = p_period_id;

  insert into gl.period_close_snapshot (
    entity_id, period_id, account_id, closing_base, period_debit, period_credit, close_seq
  )
  select v_period.entity_id, p_period_id, tb.account_id, tb.closing_base,
         tb.period_debit, tb.period_credit, v_seq
    from gl.trial_balance(v_period.entity_id, p_period_id) tb;

  update gl.fiscal_periods
     set status    = 'CLOSED',
         closed_at = now(),
         closed_by = app.acting_user_id()
   where id = p_period_id;

  -- Roll the calendar forward so trading is never blocked by an unopened period.
  update gl.fiscal_periods
     set status = 'OPEN'
   where entity_id = v_period.entity_id
     and status = 'FUTURE'
     and start_date = (
       select min(start_date) from gl.fiscal_periods
        where entity_id = v_period.entity_id and status = 'FUTURE'
     );
end;
$$;

create or replace function gl.reopen_period(p_period_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_period gl.fiscal_periods%rowtype;
  v_later  text;
begin
  select * into v_period from gl.fiscal_periods where id = p_period_id for update;
  if not found then
    raise exception 'Period % does not exist', p_period_id using errcode = 'no_data_found';
  end if;

  perform app.require_permission(v_period.entity_id, 'gl.reopen_period');

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Reopening a closed period requires a documented reason'
      using errcode = 'null_value_not_allowed';
  end if;

  if v_period.status = 'PERMANENTLY_CLOSED' then
    raise exception 'Period % is permanently closed. Its fiscal year has been closed and signed off.',
      v_period.name
      using errcode = 'restrict_violation';
  end if;

  if v_period.status <> 'CLOSED' then
    raise exception 'Period % is % and is not closed', v_period.name, v_period.status
      using errcode = 'restrict_violation';
  end if;

  -- Reopening behind a closed period would invalidate that period's snapshot.
  select string_agg(name, ', ' order by start_date) into v_later
    from gl.fiscal_periods
   where entity_id = v_period.entity_id
     and start_date > v_period.end_date
     and status in ('CLOSED', 'PERMANENTLY_CLOSED');

  if v_later is not null then
    raise exception 'Cannot reopen %: the later period(s) % are already closed. Reopen them first.',
      v_period.name, v_later
      using errcode = 'restrict_violation';
  end if;

  insert into gl.period_reopen_log (entity_id, period_id, reason, reopened_by)
  values (v_period.entity_id, p_period_id, p_reason, app.acting_user_id());

  update gl.fiscal_periods
     set status         = 'OPEN',
         closed_at      = null,
         closed_by      = null,
         reopened_count = reopened_count + 1
   where id = p_period_id;
end;
$$;

comment on function gl.reopen_period(uuid, text) is
  'Invariant 7. Requires the gl.reopen_period permission, a written reason, and that no later period has been closed.';

-- ---------------------------------------------------------------------------
-- Closing a fiscal year
-- ---------------------------------------------------------------------------

create or replace function gl.close_fiscal_year(p_fiscal_year_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_year      gl.fiscal_years%rowtype;
  v_open      text;
  v_retained  uuid;
  v_lines     jsonb := '[]'::jsonb;
  v_net       app.money_amount := 0;
  v_row       record;
  v_entry_id  uuid;
  v_adj_period gl.fiscal_periods%rowtype;
begin
  select * into v_year from gl.fiscal_years where id = p_fiscal_year_id for update;
  if not found then
    raise exception 'Fiscal year % does not exist', p_fiscal_year_id using errcode = 'no_data_found';
  end if;

  perform app.require_permission(v_year.entity_id, 'gl.close_year');

  if v_year.status <> 'OPEN' then
    raise exception 'Fiscal year % is %', v_year.code, v_year.status
      using errcode = 'restrict_violation';
  end if;

  -- The adjustment period stays open to receive the closing entry; every
  -- trading period must already be closed.
  select string_agg(name, ', ' order by period_no) into v_open
    from gl.fiscal_periods
   where fiscal_year_id = p_fiscal_year_id
     and period_no < 13
     and status <> 'CLOSED';

  if v_open is not null then
    raise exception 'Cannot close %: period(s) % are not closed', v_year.code, v_open
      using errcode = 'restrict_violation';
  end if;

  select * into v_adj_period
    from gl.fiscal_periods
   where fiscal_year_id = p_fiscal_year_id and period_no = 13;

  if v_adj_period.status = 'FUTURE' then
    update gl.fiscal_periods set status = 'OPEN' where id = v_adj_period.id;
  end if;

  v_retained := gl.setting_account(v_year.entity_id, 'RETAINED_EARNINGS');

  -- Every profit and loss account is brought back to nil, and the net result
  -- lands in retained earnings. Balance sheet accounts carry forward untouched.
  for v_row in
    select l.account_id, sum(l.debit_base - l.credit_base) as net
      from gl.journal_entry_line l
      join gl.accounts a on a.id = l.account_id
     where l.entity_id = v_year.entity_id
       and l.entry_date between v_year.start_date and v_year.end_date
       and a.account_type in ('REVENUE', 'EXPENSE')
     group by l.account_id
    having sum(l.debit_base - l.credit_base) <> 0
  loop
    v_lines := v_lines || jsonb_build_object(
      'account_id', v_row.account_id,
      'debit',      case when v_row.net < 0 then abs(v_row.net) else 0 end,
      'credit',     case when v_row.net > 0 then v_row.net else 0 end,
      'memo',       'Year end close ' || v_year.code
    );
    v_net := v_net + v_row.net;
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    raise exception 'Fiscal year % has no profit or loss activity to close', v_year.code
      using errcode = 'no_data_found';
  end if;

  -- A net debit across P&L is a loss, which debits retained earnings.
  v_lines := v_lines || jsonb_build_object(
    'account_id', v_retained,
    'debit',      case when v_net > 0 then v_net else 0 end,
    'credit',     case when v_net < 0 then abs(v_net) else 0 end,
    'memo',       'Result for ' || v_year.code
  );

  v_entry_id := gl.post_entry(
    v_year.entity_id,
    jsonb_build_object(
      'entry_date',  v_adj_period.end_date,
      'source_type', 'YEAR_END_CLOSE',
      'description', 'Year end close ' || v_year.code,
      'lines',       v_lines
    ),
    'year-end-close:' || p_fiscal_year_id::text
  );

  update gl.fiscal_periods
     set status = 'PERMANENTLY_CLOSED', closed_at = now(), closed_by = app.acting_user_id()
   where fiscal_year_id = p_fiscal_year_id;

  update gl.fiscal_years
     set status = 'CLOSED', closed_at = now(), closed_by = app.acting_user_id()
   where id = p_fiscal_year_id;

  return v_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Foreign currency revaluation
--
-- A USD receivable of 10,000 recorded when the rate was 128 sits in the ledger
-- at 1,280,000 KES. If the rate is 131 at the period end, the business is owed
-- 1,310,000 KES and the balance sheet must say so. The 30,000 difference is an
-- unrealised gain: real enough to report, not yet realised in cash.
--
-- Each run posts only the movement since the last run, tracked per account and
-- currency, so revaluations do not compound and no reversing entry is needed
-- at the start of the following period.
-- ---------------------------------------------------------------------------

create table gl.fx_revaluation_run (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references app.entities (id) on delete restrict,
  period_id       uuid not null references gl.fiscal_periods (id) on delete restrict,
  as_at           date not null,
  rate_type       text not null default 'CLOSING',
  journal_entry_id uuid references gl.journal_entry (id) on delete restrict,
  net_gain_base   app.money_amount not null default 0,
  run_at          timestamptz not null default now(),
  run_by          uuid not null references app.users (id)
);

create table gl.fx_revaluation_position (
  entity_id       uuid    not null references app.entities (id) on delete restrict,
  account_id      uuid    not null references gl.accounts (id) on delete restrict,
  currency_code   char(3) not null references app.currencies (code),
  cumulative_adjustment_base app.money_amount not null default 0,
  last_run_id     uuid    references gl.fx_revaluation_run (id),
  updated_at      timestamptz not null default now(),
  primary key (entity_id, account_id, currency_code)
);

comment on table gl.fx_revaluation_position is
  'How much base-currency adjustment has already been posted against each foreign balance. Lets the next run post only the delta.';

create or replace function gl.revalue_fx(
  p_entity_id uuid,
  p_period_id uuid,
  p_rate_type text default 'CLOSING'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_period   gl.fiscal_periods%rowtype;
  v_base     char(3);
  v_row      record;
  v_rate     app.fx_rate;
  v_target   app.money_amount;
  v_current  app.money_amount;
  v_delta    app.money_amount;
  v_net      app.money_amount := 0;
  v_lines    jsonb := '[]'::jsonb;
  v_run_id   uuid;
  v_entry_id uuid;
  v_gain_acct uuid;
  v_loss_acct uuid;
begin
  select * into v_period from gl.fiscal_periods where id = p_period_id and entity_id = p_entity_id;
  if not found then
    raise exception 'Period % does not exist on entity %', p_period_id, p_entity_id
      using errcode = 'no_data_found';
  end if;

  perform app.require_permission(p_entity_id, 'gl.revalue_fx');
  perform gl.assert_period_open(p_entity_id, v_period.end_date);

  select base_currency_code into v_base from app.entities where id = p_entity_id;

  insert into gl.fx_revaluation_run (entity_id, period_id, as_at, rate_type, run_by)
  values (p_entity_id, p_period_id, v_period.end_date, p_rate_type, app.acting_user_id())
  returning id into v_run_id;

  v_gain_acct := gl.setting_account(p_entity_id, 'FX_UNREALISED_GAIN');
  v_loss_acct := gl.setting_account(p_entity_id, 'FX_UNREALISED_LOSS');

  for v_row in
    select l.account_id,
           l.currency_code,
           sum(l.debit_txn - l.credit_txn)   as balance_txn,
           sum(l.debit_base - l.credit_base) as balance_base
      from gl.journal_entry_line l
      join gl.accounts a on a.id = l.account_id
     where l.entity_id = p_entity_id
       and l.entry_date <= v_period.end_date
       and l.currency_code <> v_base
       and a.is_monetary
     group by l.account_id, l.currency_code
    having sum(l.debit_txn - l.credit_txn) <> 0
  loop
    v_rate := app.fx_rate_on(p_entity_id, v_row.currency_code, v_base, v_period.end_date, p_rate_type);

    v_target := round(v_row.balance_txn * v_rate, 4);

    select v_row.balance_base + coalesce(p.cumulative_adjustment_base, 0)
      into v_current
      from (select 1) x
      left join gl.fx_revaluation_position p
        on p.entity_id = p_entity_id
       and p.account_id = v_row.account_id
       and p.currency_code = v_row.currency_code;

    v_delta := round(v_target - v_current, 4);

    if v_delta = 0 then
      continue;
    end if;

    -- The adjustment is denominated in base currency: the foreign balance is
    -- unchanged, only its worth in shillings has moved.
    v_lines := v_lines || jsonb_build_object(
      'account_id',    v_row.account_id,
      'currency_code', v_base,
      'fx_rate',       1,
      'debit',         case when v_delta > 0 then v_delta else 0 end,
      'credit',        case when v_delta < 0 then abs(v_delta) else 0 end,
      'memo',          format('Revaluation of %s %s at %s', v_row.currency_code, v_row.balance_txn, v_rate)
    );

    v_net := v_net + v_delta;

    insert into gl.fx_revaluation_position as p (
      entity_id, account_id, currency_code, cumulative_adjustment_base, last_run_id
    )
    values (p_entity_id, v_row.account_id, v_row.currency_code, v_delta, v_run_id)
    on conflict (entity_id, account_id, currency_code) do update
      set cumulative_adjustment_base = p.cumulative_adjustment_base + excluded.cumulative_adjustment_base,
          last_run_id = excluded.last_run_id,
          updated_at  = now();
  end loop;

  if jsonb_array_length(v_lines) = 0 then
    -- Nothing moved. The run is still recorded, because "we checked and there
    -- was nothing to do" is itself worth being able to prove.
    return v_run_id;
  end if;

  -- A net debit to monetary accounts is a gain: assets are worth more.
  v_lines := v_lines || jsonb_build_object(
    'account_id',    case when v_net > 0 then v_gain_acct else v_loss_acct end,
    'currency_code', v_base,
    'fx_rate',       1,
    'debit',         case when v_net < 0 then abs(v_net) else 0 end,
    'credit',        case when v_net > 0 then v_net else 0 end,
    'memo',          'Unrealised exchange difference'
  );

  v_entry_id := gl.post_entry(
    p_entity_id,
    jsonb_build_object(
      'entry_date',  v_period.end_date,
      'source_type', 'FX_REVALUATION',
      'source_id',   v_run_id,
      'description', format('Foreign currency revaluation at %s', v_period.end_date),
      'lines',       v_lines
    ),
    'fx-revaluation:' || v_run_id::text
  );

  update gl.fx_revaluation_run
     set journal_entry_id = v_entry_id, net_gain_base = v_net
   where id = v_run_id;

  return v_run_id;
end;
$$;

comment on function gl.revalue_fx(uuid, uuid, text) is
  'Restates foreign monetary balances at the closing rate, posting only the movement since the previous run.';

-- ---------------------------------------------------------------------------
-- Opening balances
--
-- The cutover from QuickBooks. Staged, validated, then posted as a single
-- journal entry dated the day before trading begins in this system.
--
-- The validation is the point of this design. A cutover that is out by a few
-- thousand shillings will not be found later; it will quietly become part of
-- the opening position and every subsequent reconciliation will fail by that
-- amount for years.
-- ---------------------------------------------------------------------------

create type gl.ob_status as enum ('DRAFT', 'VALIDATED', 'POSTED', 'CANCELLED');

create table gl.ob_batch (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references app.entities (id) on delete restrict,
  cutover_date     date not null,
  source_system    text not null default 'QuickBooks Desktop',
  description      text not null default 'Opening balances',
  status           gl.ob_status not null default 'DRAFT',
  journal_entry_id uuid references gl.journal_entry (id) on delete restrict,
  validated_at     timestamptz,
  validated_by     uuid references app.users (id),
  posted_at        timestamptz,
  posted_by        uuid references app.users (id),
  created_at       timestamptz not null default now(),
  created_by       uuid,
  updated_at       timestamptz not null default now(),
  updated_by       uuid
);

comment on column gl.ob_batch.cutover_date is
  'The balances are as at the close of business on this date. The opening journal is dated here, and trading in this system starts the following day.';

-- Only one posted cutover per entity. Doing this twice would double the
-- opening position, and it is exactly the kind of mistake that gets made at
-- 2am on a go-live weekend.
create unique index ob_batch_single_posted_idx
  on gl.ob_batch (entity_id) where status = 'POSTED';

create table gl.ob_trial_balance_line (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references gl.ob_batch (id) on delete cascade,
  line_no       integer not null,
  account_code  text not null,
  currency_code char(3) not null default 'KES' references app.currencies (code),
  debit         app.money_amount not null default 0 check (debit >= 0),
  credit        app.money_amount not null default 0 check (credit >= 0),
  memo          text,
  unique (batch_id, line_no),
  constraint ob_tb_single_sided check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create table gl.ob_ar_open_item (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references gl.ob_batch (id) on delete cascade,
  customer_code text not null,
  document_no   text not null,
  document_date date not null,
  due_date      date not null,
  currency_code char(3) not null references app.currencies (code),
  amount_txn    app.money_amount not null check (amount_txn <> 0),
  amount_base   app.money_amount not null check (amount_base <> 0),
  memo          text,
  unique (batch_id, customer_code, document_no)
);

comment on table gl.ob_ar_open_item is
  'Unpaid customer invoices at cutover. Each becomes a line on the opening journal carrying its customer dimension, so receivables ageing works from day one.';

create table gl.ob_ap_open_item (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references gl.ob_batch (id) on delete cascade,
  supplier_code text not null,
  document_no   text not null,
  document_date date not null,
  due_date      date not null,
  currency_code char(3) not null references app.currencies (code),
  amount_txn    app.money_amount not null check (amount_txn <> 0),
  amount_base   app.money_amount not null check (amount_base <> 0),
  memo          text,
  unique (batch_id, supplier_code, document_no)
);

create table gl.ob_inventory_line (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references gl.ob_batch (id) on delete cascade,
  part_number    text not null,
  warehouse_code text not null,
  bin_code       text,
  serial_number  text,
  lot_number     text,
  condition_code text not null default 'NE' references inv.condition_codes (code),
  quantity       app.quantity not null check (quantity > 0),
  unit_cost_base app.money_amount not null check (unit_cost_base >= 0),
  expiry_date    date,
  certificate_type   text references inv.certificate_types (code),
  certificate_number text,
  memo           text
);

comment on table gl.ob_inventory_line is
  'Stock on hand at cutover. Serialised parts need one row per physical unit, which is the moment the business stops being able to pretend it does not know its own serial numbers.';

create index ob_inventory_line_batch_idx on gl.ob_inventory_line (batch_id);

select app.enable_updated_at('gl.ob_batch');
select app.enable_audit('gl.ob_batch');

-- ---------------------------------------------------------------------------
-- Validation
--
-- Returns one row per check. Nothing may be posted until every row passes.
-- ---------------------------------------------------------------------------

create or replace function gl.validate_opening_balances(p_batch_id uuid)
returns table (
  check_name  text,
  expected    app.money_amount,
  actual      app.money_amount,
  difference  app.money_amount,
  passed      boolean,
  detail      text
)
language plpgsql
stable
as $$
declare
  v_batch    gl.ob_batch%rowtype;
  v_ar_acct  text;
  v_ap_acct  text;
  v_inv_acct text;
begin
  select * into v_batch from gl.ob_batch where id = p_batch_id;
  if not found then
    raise exception 'Opening balance batch % does not exist', p_batch_id using errcode = 'no_data_found';
  end if;

  select a.code into v_ar_acct from gl.accounts a
   where a.entity_id = v_batch.entity_id and a.control_type = 'ACCOUNTS_RECEIVABLE' limit 1;
  select a.code into v_ap_acct from gl.accounts a
   where a.entity_id = v_batch.entity_id and a.control_type = 'ACCOUNTS_PAYABLE' limit 1;
  select a.code into v_inv_acct from gl.accounts a
   where a.entity_id = v_batch.entity_id and a.control_type = 'INVENTORY' limit 1;

  -- 1. The trial balance itself must balance.
  return query
  select
    'Trial balance nets to zero'::text,
    0::app.money_amount,
    coalesce(sum(l.debit - l.credit), 0)::app.money_amount,
    coalesce(sum(l.debit - l.credit), 0)::app.money_amount,
    coalesce(sum(l.debit - l.credit), 0) = 0,
    format('%s lines imported', count(*))::text
  from gl.ob_trial_balance_line l
  where l.batch_id = p_batch_id;

  -- 2. Every account code in the trial balance must exist and be postable.
  return query
  select
    'All accounts exist and are postable'::text,
    0::app.money_amount,
    count(*)::app.money_amount,
    count(*)::app.money_amount,
    count(*) = 0,
    coalesce(string_agg(l.account_code, ', ' order by l.account_code), 'none')::text
  from gl.ob_trial_balance_line l
  where l.batch_id = p_batch_id
    and not exists (
      select 1 from gl.accounts a
       where a.entity_id = v_batch.entity_id
         and a.code = l.account_code
         and a.is_postable
         and a.is_active
    );

  -- 3. Receivables detail must agree with the receivables control total.
  return query
  select
    'Receivables detail agrees with control account'::text,
    coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ar_acct
    ), 0)::app.money_amount,
    coalesce((
      select sum(i.amount_base) from gl.ob_ar_open_item i where i.batch_id = p_batch_id
    ), 0)::app.money_amount,
    (coalesce((
      select sum(i.amount_base) from gl.ob_ar_open_item i where i.batch_id = p_batch_id
    ), 0) - coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ar_acct
    ), 0))::app.money_amount,
    coalesce((
      select sum(i.amount_base) from gl.ob_ar_open_item i where i.batch_id = p_batch_id
    ), 0) = coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ar_acct
    ), 0),
    format('control account %s', coalesce(v_ar_acct, 'NOT CONFIGURED'))::text;

  -- 4. Payables detail must agree with the payables control total. Payables
  --    sit on the credit side, hence the sign flip.
  return query
  select
    'Payables detail agrees with control account'::text,
    coalesce((
      select sum(t.credit - t.debit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ap_acct
    ), 0)::app.money_amount,
    coalesce((
      select sum(i.amount_base) from gl.ob_ap_open_item i where i.batch_id = p_batch_id
    ), 0)::app.money_amount,
    (coalesce((
      select sum(i.amount_base) from gl.ob_ap_open_item i where i.batch_id = p_batch_id
    ), 0) - coalesce((
      select sum(t.credit - t.debit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ap_acct
    ), 0))::app.money_amount,
    coalesce((
      select sum(i.amount_base) from gl.ob_ap_open_item i where i.batch_id = p_batch_id
    ), 0) = coalesce((
      select sum(t.credit - t.debit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_ap_acct
    ), 0),
    format('control account %s', coalesce(v_ap_acct, 'NOT CONFIGURED'))::text;

  -- 5. Stock valuation must agree with the inventory control total.
  return query
  select
    'Inventory valuation agrees with control account'::text,
    coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_inv_acct
    ), 0)::app.money_amount,
    coalesce((
      select round(sum(i.quantity * i.unit_cost_base), 4) from gl.ob_inventory_line i
       where i.batch_id = p_batch_id
    ), 0)::app.money_amount,
    (coalesce((
      select round(sum(i.quantity * i.unit_cost_base), 4) from gl.ob_inventory_line i
       where i.batch_id = p_batch_id
    ), 0) - coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_inv_acct
    ), 0))::app.money_amount,
    coalesce((
      select round(sum(i.quantity * i.unit_cost_base), 4) from gl.ob_inventory_line i
       where i.batch_id = p_batch_id
    ), 0) = coalesce((
      select sum(t.debit - t.credit) from gl.ob_trial_balance_line t
       where t.batch_id = p_batch_id and t.account_code = v_inv_acct
    ), 0),
    format('control account %s', coalesce(v_inv_acct, 'NOT CONFIGURED'))::text;

  -- 6. Every customer, supplier, part and warehouse referenced must exist.
  return query
  select
    'All referenced master records exist'::text,
    0::app.money_amount,
    count(*)::app.money_amount,
    count(*)::app.money_amount,
    count(*) = 0,
    coalesce(string_agg(missing, '; ' order by missing), 'none')::text
  from (
    select 'customer ' || i.customer_code as missing
      from gl.ob_ar_open_item i
     where i.batch_id = p_batch_id
       and not exists (select 1 from app.customers c
                        where c.entity_id = v_batch.entity_id and c.code = i.customer_code)
    union
    select 'supplier ' || i.supplier_code
      from gl.ob_ap_open_item i
     where i.batch_id = p_batch_id
       and not exists (select 1 from app.suppliers s
                        where s.entity_id = v_batch.entity_id and s.code = i.supplier_code)
    union
    select 'part ' || i.part_number
      from gl.ob_inventory_line i
     where i.batch_id = p_batch_id
       and not exists (select 1 from inv.items it
                        where it.entity_id = v_batch.entity_id and it.part_number = i.part_number)
    union
    select 'warehouse ' || i.warehouse_code
      from gl.ob_inventory_line i
     where i.batch_id = p_batch_id
       and not exists (select 1 from inv.warehouses w
                        where w.entity_id = v_batch.entity_id and w.code = i.warehouse_code)
  ) m;

  -- 7. Serialised parts need a serial number, and it must be unique.
  return query
  select
    'Serialised stock lines carry a unique serial number'::text,
    0::app.money_amount,
    count(*)::app.money_amount,
    count(*)::app.money_amount,
    count(*) = 0,
    coalesce(string_agg(distinct i.part_number, ', '), 'none')::text
  from gl.ob_inventory_line i
  join inv.items it on it.entity_id = v_batch.entity_id and it.part_number = i.part_number
  where i.batch_id = p_batch_id
    and it.tracking_mode = 'SERIAL'
    and (i.serial_number is null or i.quantity <> 1);

  -- 8. The cutover date must fall in an open period.
  return query
  select
    'Cutover date falls in an open period'::text,
    0::app.money_amount,
    0::app.money_amount,
    0::app.money_amount,
    exists (
      select 1 from gl.fiscal_periods p
       where p.entity_id = v_batch.entity_id
         and v_batch.cutover_date between p.start_date and p.end_date
         and p.status = 'OPEN'
    ),
    format('cutover %s', v_batch.cutover_date)::text;
end;
$$;

comment on function gl.validate_opening_balances(uuid) is
  'Eight checks over the staged cutover data. Every one must pass before gl.post_opening_balances will do anything.';

-- ---------------------------------------------------------------------------
-- Posting the cutover
-- ---------------------------------------------------------------------------

create or replace function gl.post_opening_balances(p_batch_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_batch     gl.ob_batch%rowtype;
  v_failed    text;
  v_ar_acct   gl.accounts%rowtype;
  v_ap_acct   gl.accounts%rowtype;
  v_inv_acct  gl.accounts%rowtype;
  v_lines     jsonb := '[]'::jsonb;
  v_row       record;
  v_entry_id  uuid;
  v_unit_id   uuid;
  v_lot_id    uuid;
  v_item      inv.items%rowtype;
  v_warehouse inv.warehouses%rowtype;
  v_bin_id    uuid;
begin
  select * into v_batch from gl.ob_batch where id = p_batch_id for update;
  if not found then
    raise exception 'Opening balance batch % does not exist', p_batch_id using errcode = 'no_data_found';
  end if;

  perform app.require_permission(v_batch.entity_id, 'gl.post_opening_balances');

  if v_batch.status = 'POSTED' then
    return v_batch.journal_entry_id;
  end if;
  if v_batch.status = 'CANCELLED' then
    raise exception 'Opening balance batch % was cancelled', p_batch_id
      using errcode = 'restrict_violation';
  end if;

  select string_agg(check_name || ' (out by ' || difference || ')', '; ')
    into v_failed
    from gl.validate_opening_balances(p_batch_id)
   where not passed;

  if v_failed is not null then
    raise exception 'Opening balances cannot be posted. Failing checks: %', v_failed
      using errcode = 'check_violation';
  end if;

  select * into v_ar_acct from gl.accounts
   where entity_id = v_batch.entity_id and control_type = 'ACCOUNTS_RECEIVABLE' limit 1;
  select * into v_ap_acct from gl.accounts
   where entity_id = v_batch.entity_id and control_type = 'ACCOUNTS_PAYABLE' limit 1;
  select * into v_inv_acct from gl.accounts
   where entity_id = v_batch.entity_id and control_type = 'INVENTORY' limit 1;

  -- Every trial balance line except the three control accounts, whose detail
  -- is expanded below so the sub-ledgers are populated rather than lumped.
  for v_row in
    select l.*, a.id as account_id
      from gl.ob_trial_balance_line l
      join gl.accounts a on a.entity_id = v_batch.entity_id and a.code = l.account_code
     where l.batch_id = p_batch_id
       and l.account_code is distinct from v_ar_acct.code
       and l.account_code is distinct from v_ap_acct.code
     order by l.line_no
  loop
    v_lines := v_lines || jsonb_build_object(
      'account_id',  v_row.account_id,
      'debit',       v_row.debit,
      'credit',      v_row.credit,
      'debit_base',  v_row.debit,
      'credit_base', v_row.credit,
      'memo',        coalesce(v_row.memo, 'Opening balance')
    );
  end loop;

  -- Receivables, one line per open invoice, carrying the customer.
  for v_row in
    select i.*, c.id as customer_id
      from gl.ob_ar_open_item i
      join app.customers c on c.entity_id = v_batch.entity_id and c.code = i.customer_code
     where i.batch_id = p_batch_id
     order by i.customer_code, i.document_no
  loop
    v_lines := v_lines || jsonb_build_object(
      'account_id',    v_ar_acct.id,
      'currency_code', v_row.currency_code,
      'fx_rate',       case when v_row.amount_txn = 0 then 1
                            else round(abs(v_row.amount_base / v_row.amount_txn), 8) end,
      'debit',         case when v_row.amount_txn > 0 then v_row.amount_txn else 0 end,
      'credit',        case when v_row.amount_txn < 0 then abs(v_row.amount_txn) else 0 end,
      'debit_base',    case when v_row.amount_base > 0 then v_row.amount_base else 0 end,
      'credit_base',   case when v_row.amount_base < 0 then abs(v_row.amount_base) else 0 end,
      'customer_id',   v_row.customer_id,
      'memo',          format('%s dated %s, due %s', v_row.document_no, v_row.document_date, v_row.due_date)
    );
  end loop;

  -- Payables, one line per open bill, carrying the supplier.
  for v_row in
    select i.*, s.id as supplier_id
      from gl.ob_ap_open_item i
      join app.suppliers s on s.entity_id = v_batch.entity_id and s.code = i.supplier_code
     where i.batch_id = p_batch_id
     order by i.supplier_code, i.document_no
  loop
    v_lines := v_lines || jsonb_build_object(
      'account_id',    v_ap_acct.id,
      'currency_code', v_row.currency_code,
      'fx_rate',       case when v_row.amount_txn = 0 then 1
                            else round(abs(v_row.amount_base / v_row.amount_txn), 8) end,
      'debit',         case when v_row.amount_txn < 0 then abs(v_row.amount_txn) else 0 end,
      'credit',        case when v_row.amount_txn > 0 then v_row.amount_txn else 0 end,
      'debit_base',    case when v_row.amount_base < 0 then abs(v_row.amount_base) else 0 end,
      'credit_base',   case when v_row.amount_base > 0 then v_row.amount_base else 0 end,
      'supplier_id',   v_row.supplier_id,
      'memo',          format('%s dated %s, due %s', v_row.document_no, v_row.document_date, v_row.due_date)
    );
  end loop;

  v_entry_id := gl.post_entry(
    v_batch.entity_id,
    jsonb_build_object(
      'entry_date',         v_batch.cutover_date,
      'source_type',        'OPENING_BALANCE',
      'source_id',          p_batch_id,
      'source_document_no', v_batch.source_system,
      'description',        format('%s as at %s (from %s)',
                                   v_batch.description, v_batch.cutover_date, v_batch.source_system),
      'lines',              v_lines
    ),
    'opening-balance:' || p_batch_id::text
  );

  -- -------------------------------------------------------------------------
  -- Inventory sub-ledger
  --
  -- The stock ledger rows point at the journal entry just posted, which is
  -- what established the inventory control balance. The two therefore tie by
  -- construction rather than by a separate posting that might not agree.
  -- -------------------------------------------------------------------------
  for v_row in
    select * from gl.ob_inventory_line where batch_id = p_batch_id order by part_number, serial_number
  loop
    select * into v_item from inv.items
     where entity_id = v_batch.entity_id and part_number = v_row.part_number;
    select * into v_warehouse from inv.warehouses
     where entity_id = v_batch.entity_id and code = v_row.warehouse_code;

    select id into v_bin_id from inv.bins
     where warehouse_id = v_warehouse.id
       and code = coalesce(v_row.bin_code, 'MAIN');

    v_unit_id := null;
    v_lot_id  := null;

    if v_item.tracking_mode = 'SERIAL' then
      insert into inv.stock_units (
        entity_id, item_id, serial_number, condition_code, status,
        warehouse_id, bin_id, expiry_date, received_date,
        unit_cost_base, acquisition_currency, acquisition_cost
      )
      values (
        v_batch.entity_id, v_item.id, v_row.serial_number, v_row.condition_code, 'ON_HAND',
        v_warehouse.id, v_bin_id, v_row.expiry_date, v_batch.cutover_date,
        v_row.unit_cost_base, 'KES', v_row.unit_cost_base
      )
      returning id into v_unit_id;

      if v_row.certificate_type is not null then
        insert into inv.certificates (
          entity_id, certificate_type, certificate_number, issued_by, issue_date, stock_unit_id, notes
        )
        values (
          v_batch.entity_id, v_row.certificate_type,
          coalesce(v_row.certificate_number, 'MIGRATED'),
          v_batch.source_system, v_batch.cutover_date, v_unit_id,
          'Recorded during cutover; the physical document must still be verified.'
        );
      end if;

    elsif v_item.tracking_mode = 'LOT' and v_row.lot_number is not null then
      insert into inv.stock_lots (
        entity_id, item_id, lot_number, condition_code, expiry_date, received_date
      )
      values (
        v_batch.entity_id, v_item.id, v_row.lot_number, v_row.condition_code,
        v_row.expiry_date, v_batch.cutover_date
      )
      on conflict (entity_id, item_id, lot_number) do update set updated_at = now()
      returning id into v_lot_id;
    end if;

    insert into inv.stock_ledger (
      entity_id, item_id, warehouse_id, bin_id, stock_unit_id, stock_lot_id,
      movement_type, movement_date, quantity, unit_cost_base, value_base,
      journal_entry_id, source_type, source_id, reference, notes, created_by
    )
    values (
      v_batch.entity_id, v_item.id, v_warehouse.id, v_bin_id, v_unit_id, v_lot_id,
      'OPENING', v_batch.cutover_date, v_row.quantity, v_row.unit_cost_base,
      round(v_row.quantity * v_row.unit_cost_base, 4),
      v_entry_id, 'OPENING_BALANCE', p_batch_id, v_batch.source_system,
      coalesce(v_row.memo, 'Opening stock'), app.acting_user_id()
    );
  end loop;

  update gl.ob_batch
     set status = 'POSTED',
         journal_entry_id = v_entry_id,
         posted_at = now(),
         posted_by = app.acting_user_id()
   where id = p_batch_id;

  return v_entry_id;
end;
$$;

comment on function gl.post_opening_balances(uuid) is
  'Posts the validated cutover as one journal entry and populates the inventory sub-ledger against it. Idempotent: a second call returns the entry already posted.';

grant execute on function
  gl.create_fiscal_year(uuid, date, text, boolean),
  gl.open_period(uuid),
  gl.close_period(uuid),
  gl.reopen_period(uuid, text),
  gl.close_fiscal_year(uuid),
  gl.revalue_fx(uuid, uuid, text),
  gl.validate_opening_balances(uuid),
  gl.post_opening_balances(uuid)
to skyjet_app;

grant insert, update, delete on
  gl.ob_batch, gl.ob_trial_balance_line, gl.ob_ar_open_item,
  gl.ob_ap_open_item, gl.ob_inventory_line
to skyjet_app;
