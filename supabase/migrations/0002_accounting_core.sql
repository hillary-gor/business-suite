-- ===========================================================================
-- 0002_accounting_core.sql
--
-- The general ledger.
--
-- Everything else in this system is a way of producing rows in
-- gl.journal_entry_line. Sales, purchasing, inventory and banking are all
-- sub-ledgers whose only job is to explain, in business terms, why the ledger
-- moved. The ledger itself is deliberately dumb, deliberately immutable, and
-- deliberately the last thing anyone should ever need to change.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

create schema if not exists gl;

comment on schema gl is
  'General ledger: fiscal calendar, chart of accounts, and the immutable journal.';

-- ---------------------------------------------------------------------------
-- Currencies and exchange rates
-- ---------------------------------------------------------------------------

create table app.currencies (
  code        char(3)  primary key check (code ~ '^[A-Z]{3}$'),
  name        text     not null,
  symbol      text,
  minor_units smallint not null default 2 check (minor_units between 0 and 4),
  is_active   boolean  not null default true
);

comment on column app.currencies.minor_units is
  'Decimal places used when presenting and rounding this currency. Storage is always 4 dp.';

create table app.fx_rates (
  id               uuid        primary key default gen_random_uuid(),
  entity_id        uuid        not null references app.entities (id) on delete restrict,
  from_currency    char(3)     not null references app.currencies (code),
  to_currency      char(3)     not null references app.currencies (code),
  rate_date        date        not null,
  rate_type        text        not null default 'SPOT'
                     check (rate_type in ('SPOT', 'CLOSING', 'MONTHLY_AVERAGE', 'CUSTOMS')),
  rate             app.fx_rate not null,
  source           text        not null default 'MANUAL',
  created_at       timestamptz not null default now(),
  created_by       uuid,
  unique (entity_id, from_currency, to_currency, rate_date, rate_type),
  check (from_currency <> to_currency)
);

comment on table app.fx_rates is
  'rate is expressed as: 1 unit of from_currency = rate units of to_currency.';
comment on column app.fx_rates.rate_type is
  'SPOT for transactions, CLOSING for period-end revaluation, MONTHLY_AVERAGE for reporting, CUSTOMS for import duty valuation.';

create index fx_rates_lookup_idx
  on app.fx_rates (entity_id, from_currency, to_currency, rate_type, rate_date desc);

-- Resolves the rate to use for a given date, taking the most recent published
-- rate on or before that date. Returns 1 for a same-currency conversion.
-- Raises rather than defaulting to 1 when no rate exists, because silently
-- valuing a USD invoice at 1 KES is the kind of error that reaches the
-- financial statements before anyone notices.
create or replace function app.fx_rate_on(
  p_entity_id     uuid,
  p_from_currency char(3),
  p_to_currency   char(3),
  p_date          date,
  p_rate_type     text default 'SPOT'
)
returns app.fx_rate
language plpgsql
stable
as $$
declare
  v_rate app.fx_rate;
begin
  if p_from_currency = p_to_currency then
    return 1::app.fx_rate;
  end if;

  select r.rate into v_rate
    from app.fx_rates r
   where r.entity_id = p_entity_id
     and r.from_currency = p_from_currency
     and r.to_currency = p_to_currency
     and r.rate_type = p_rate_type
     and r.rate_date <= p_date
   order by r.rate_date desc
   limit 1;

  if v_rate is not null then
    return v_rate;
  end if;

  -- Fall back to the inverse of a published reciprocal rate.
  select round(1 / r.rate, 8) into v_rate
    from app.fx_rates r
   where r.entity_id = p_entity_id
     and r.from_currency = p_to_currency
     and r.to_currency = p_from_currency
     and r.rate_type = p_rate_type
     and r.rate_date <= p_date
   order by r.rate_date desc
   limit 1;

  if v_rate is not null then
    return v_rate;
  end if;

  raise exception 'No % exchange rate from % to % on or before % for entity %',
    p_rate_type, p_from_currency, p_to_currency, p_date, p_entity_id
    using errcode = 'no_data_found';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fiscal calendar
-- ---------------------------------------------------------------------------

create type gl.period_status as enum ('FUTURE', 'OPEN', 'CLOSED', 'PERMANENTLY_CLOSED');
create type gl.year_status   as enum ('FUTURE', 'OPEN', 'CLOSED', 'PERMANENTLY_CLOSED');

create table gl.fiscal_years (
  id         uuid           primary key default gen_random_uuid(),
  entity_id  uuid           not null references app.entities (id) on delete restrict,
  code       text           not null,
  start_date date           not null,
  end_date   date           not null,
  status     gl.year_status not null default 'FUTURE',
  closed_at  timestamptz,
  closed_by  uuid           references app.users (id),
  created_at timestamptz    not null default now(),
  updated_at timestamptz    not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (entity_id, code),
  check (end_date > start_date),
  constraint fiscal_years_no_overlap exclude using gist (
    entity_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

create table gl.fiscal_periods (
  id             uuid             primary key default gen_random_uuid(),
  entity_id      uuid             not null references app.entities (id) on delete restrict,
  fiscal_year_id uuid             not null references gl.fiscal_years (id) on delete restrict,
  period_no      smallint         not null check (period_no between 1 and 13),
  name           text             not null,
  start_date     date             not null,
  end_date       date             not null,
  status         gl.period_status not null default 'FUTURE',
  closed_at      timestamptz,
  closed_by      uuid             references app.users (id),
  reopened_count integer          not null default 0,
  created_at     timestamptz      not null default now(),
  updated_at     timestamptz      not null default now(),
  created_by     uuid,
  updated_by     uuid,
  unique (fiscal_year_id, period_no),
  check (end_date >= start_date),
  constraint fiscal_periods_no_overlap exclude using gist (
    entity_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

comment on column gl.fiscal_periods.period_no is
  'Period 13 is reserved for year-end adjustments so that audit journals do not distort December.';
comment on column gl.fiscal_periods.reopened_count is
  'Incremented every time a closed period is reopened. A non-zero value is a flag for the auditor.';

create index fiscal_periods_entity_date_idx
  on gl.fiscal_periods (entity_id, start_date, end_date);

-- Resolves the period a posting date falls into. Raises when the calendar has
-- not been extended far enough, which is a configuration error rather than a
-- reason to guess.
create or replace function gl.period_for_date(p_entity_id uuid, p_date date)
returns gl.fiscal_periods
language plpgsql
stable
as $$
declare
  v_period gl.fiscal_periods%rowtype;
begin
  select * into v_period
    from gl.fiscal_periods
   where entity_id = p_entity_id
     and p_date between start_date and end_date
   order by period_no
   limit 1;

  if not found then
    raise exception 'No fiscal period defined for % on entity %. Extend the fiscal calendar.',
      p_date, p_entity_id
      using errcode = 'no_data_found';
  end if;

  return v_period;
end;
$$;

create or replace function gl.assert_period_open(p_entity_id uuid, p_date date)
returns uuid
language plpgsql
stable
as $$
declare
  v_period gl.fiscal_periods%rowtype;
begin
  v_period := gl.period_for_date(p_entity_id, p_date);

  if v_period.status <> 'OPEN' then
    raise exception 'Accounting period % (% to %) is %; postings dated % are not permitted.',
      v_period.name, v_period.start_date, v_period.end_date, v_period.status, p_date
      using errcode = 'restrict_violation';
  end if;

  return v_period.id;
end;
$$;

comment on function gl.assert_period_open(uuid, date) is
  'Invariant 7. Called by every posting path before a single row is written.';

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

create type gl.account_type as enum ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
create type gl.balance_side as enum ('DEBIT', 'CREDIT');

-- Control accounts are owned by a sub-ledger. A human may not post to them
-- directly; only the owning module may, and only with the dimension that ties
-- the posting back to the sub-ledger detail.
create type gl.control_type as enum (
  'ACCOUNTS_RECEIVABLE',
  'ACCOUNTS_PAYABLE',
  'INVENTORY',
  'GOODS_RECEIVED_NOT_INVOICED',
  'BANK',
  'CASH',
  'TAX_OUTPUT',
  'TAX_INPUT',
  'RETAINED_EARNINGS',
  'FX_REALISED',
  'FX_UNREALISED',
  'ROUNDING',
  'SUSPENSE'
);

create table gl.accounts (
  id                uuid            primary key default gen_random_uuid(),
  entity_id         uuid            not null references app.entities (id) on delete restrict,
  code              text            not null check (code ~ '^[0-9A-Z][0-9A-Z.\-]{0,19}$'),
  name              text            not null,
  description       text,
  account_type      gl.account_type not null,
  normal_balance    gl.balance_side not null,
  parent_id         uuid            references gl.accounts (id) on delete restrict,
  is_postable       boolean         not null default true,
  is_active         boolean         not null default true,
  is_system         boolean         not null default false,
  control_type      gl.control_type,
  currency_code     char(3)         references app.currencies (code),
  requires_customer boolean         not null default false,
  requires_supplier boolean         not null default false,
  requires_warehouse boolean        not null default false,
  requires_item     boolean         not null default false,
  is_reconcilable   boolean         not null default false,
  is_monetary       boolean         not null default false,
  is_contra         boolean         not null default false,
  sort_key          text,
  created_at        timestamptz     not null default now(),
  updated_at        timestamptz     not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (entity_id, code),
  -- The normal balance must agree with the account type. Getting this wrong
  -- inverts every report that groups by it. Contra accounts are the deliberate
  -- exception: accumulated depreciation is an asset-class account that carries
  -- a credit balance, and sales returns are a revenue-class account that
  -- carries a debit balance.
  constraint accounts_normal_balance_matches_type check (
    is_contra
    or (account_type in ('ASSET', 'EXPENSE') and normal_balance = 'DEBIT')
    or (account_type in ('LIABILITY', 'EQUITY', 'REVENUE') and normal_balance = 'CREDIT')
  ),
  constraint accounts_contra_is_inverted check (
    not is_contra
    or (account_type in ('ASSET', 'EXPENSE') and normal_balance = 'CREDIT')
    or (account_type in ('LIABILITY', 'EQUITY', 'REVENUE') and normal_balance = 'DEBIT')
  ),
  -- Only leaf accounts take postings; parents exist to roll up.
  constraint accounts_parent_not_postable check (parent_id is null or parent_id <> id)
);

comment on column gl.accounts.currency_code is
  'When set, the account may only hold this currency. Used for foreign bank accounts so a KES posting cannot land in a USD account.';
comment on column gl.accounts.control_type is
  'Marks the account as owned by a sub-ledger. Manual journals against control accounts are refused by the posting engine.';
comment on column gl.accounts.is_reconcilable is
  'Bank and clearing accounts whose balance is proved against an external statement.';
comment on column gl.accounts.is_monetary is
  'Monetary balances - cash, receivables, payables - are restated at the closing rate each period end. Inventory and fixed assets are not: they stay at historical cost.';

create index accounts_entity_type_idx on gl.accounts (entity_id, account_type, code);
create index accounts_parent_idx on gl.accounts (parent_id);
create unique index accounts_control_unique_idx
  on gl.accounts (entity_id, control_type, coalesce(currency_code, '***'))
  where control_type is not null and control_type <> 'BANK' and control_type <> 'CASH';

-- A parent account must not be postable, and a postable account must not have
-- children. Enforced by trigger because it spans rows.
create or replace function gl.fn_accounts_hierarchy_guard()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from gl.accounts a where a.id = new.parent_id and a.is_postable) then
      update gl.accounts set is_postable = false where id = new.parent_id;
    end if;
    if (select entity_id from gl.accounts where id = new.parent_id) <> new.entity_id then
      raise exception 'Account % may not have a parent belonging to a different entity', new.code;
    end if;
  end if;
  return new;
end;
$$;

create trigger accounts_hierarchy_guard
  before insert or update on gl.accounts
  for each row execute function gl.fn_accounts_hierarchy_guard();

-- Per-entity mapping of the accounts the engine itself must be able to find.
-- Without this the posting engine would have to hard-code account codes, and
-- the chart of accounts could never be reorganised.
create table gl.entity_account_settings (
  entity_id    uuid not null references app.entities (id) on delete restrict,
  setting_code text not null,
  account_id   uuid not null references gl.accounts (id) on delete restrict,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  primary key (entity_id, setting_code)
);

comment on table gl.entity_account_settings is
  'Named account slots the engine resolves at runtime: ROUNDING, FX_REALISED_GAIN, RETAINED_EARNINGS, and so on.';

create or replace function gl.setting_account(p_entity_id uuid, p_setting_code text)
returns uuid
language plpgsql
stable
as $$
declare
  v_account_id uuid;
begin
  select account_id into v_account_id
    from gl.entity_account_settings
   where entity_id = p_entity_id and setting_code = p_setting_code;

  if v_account_id is null then
    raise exception 'Account setting % is not configured for entity %. Configure it before posting.',
      p_setting_code, p_entity_id
      using errcode = 'no_data_found';
  end if;

  return v_account_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The journal
-- ---------------------------------------------------------------------------

create table gl.journal_sources (
  code        text primary key check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name        text not null,
  is_manual   boolean not null default false,
  description text not null default ''
);

insert into gl.journal_sources (code, name, is_manual, description) values
  ('MANUAL',           'Manual Journal',        true,  'Entered by a person with gl.post_journal'),
  ('OPENING_BALANCE',  'Opening Balance',       false, 'Cutover from the previous accounting system'),
  ('REVERSAL',         'Reversal',              false, 'System-generated reversal of an earlier entry'),
  ('FX_REVALUATION',   'FX Revaluation',        false, 'Period-end revaluation of monetary balances'),
  ('YEAR_END_CLOSE',   'Year End Close',        false, 'Transfer of profit or loss to retained earnings'),
  ('STOCK_MOVEMENT',   'Stock Movement',        false, 'Inventory receipt, issue, transfer or adjustment')
on conflict (code) do nothing;

create table gl.journal_entry (
  id                   uuid        primary key default gen_random_uuid(),
  entity_id            uuid        not null references app.entities (id) on delete restrict,
  entry_no             text        not null,
  entry_date           date        not null,
  period_id            uuid        not null references gl.fiscal_periods (id) on delete restrict,
  source_type          text        not null references gl.journal_sources (code),
  source_id            uuid,
  source_document_no   text,
  description          text        not null check (length(btrim(description)) > 0),
  memo                 text,
  base_currency_code   char(3)     not null references app.currencies (code),
  total_debit_base     app.money_amount not null check (total_debit_base >= 0),
  total_credit_base    app.money_amount not null check (total_credit_base >= 0),
  line_count           integer     not null check (line_count > 0),
  reversal_of_entry_id uuid        references gl.journal_entry (id) on delete restrict,
  reversal_reason      text,
  idempotency_key      text,
  posted_at            timestamptz not null default now(),
  posted_by            uuid        not null references app.users (id),
  unique (entity_id, entry_no),
  -- The denormalised totals must agree with each other. The per-line proof
  -- happens in the deferred constraint trigger below.
  constraint journal_entry_totals_balance check (total_debit_base = total_credit_base),
  constraint journal_entry_reversal_has_reason check (
    reversal_of_entry_id is null or length(btrim(coalesce(reversal_reason, ''))) > 0
  )
);

comment on table gl.journal_entry is
  'A posted journal entry. There is no draft state here: drafts live on the originating business document. Once a row exists, it is history.';
comment on column gl.journal_entry.reversal_of_entry_id is
  'Set on the reversing entry, pointing at the entry it cancels. The original is never modified.';

-- Invariant 2 support: an entry may be reversed at most once.
create unique index journal_entry_single_reversal_idx
  on gl.journal_entry (reversal_of_entry_id)
  where reversal_of_entry_id is not null;

create unique index journal_entry_idempotency_idx
  on gl.journal_entry (entity_id, idempotency_key)
  where idempotency_key is not null;

create index journal_entry_period_idx on gl.journal_entry (entity_id, period_id, entry_date);
create index journal_entry_date_idx on gl.journal_entry (entity_id, entry_date desc, entry_no);
create index journal_entry_source_idx on gl.journal_entry (entity_id, source_type, source_id);

create table gl.journal_entry_line (
  id            uuid     primary key default gen_random_uuid(),
  entry_id      uuid     not null references gl.journal_entry (id) on delete restrict,
  entity_id     uuid     not null references app.entities (id) on delete restrict,
  line_no       integer  not null check (line_no > 0),
  account_id    uuid     not null references gl.accounts (id) on delete restrict,

  -- Denormalised from the header so that the ledger can be queried and
  -- aggregated by period and date without a join. Kept honest by trigger.
  entry_date    date     not null,
  period_id     uuid     not null references gl.fiscal_periods (id) on delete restrict,

  -- Transaction currency: what actually changed hands.
  currency_code char(3)  not null references app.currencies (code),
  fx_rate       app.fx_rate not null default 1,
  debit_txn     app.money_amount not null default 0 check (debit_txn >= 0),
  credit_txn    app.money_amount not null default 0 check (credit_txn >= 0),

  -- Base currency: what the financial statements report.
  debit_base    app.money_amount not null default 0 check (debit_base >= 0),
  credit_base   app.money_amount not null default 0 check (credit_base >= 0),

  memo          text,

  -- Analysis dimensions. Foreign keys to the master tables are added in
  -- 0003_masters.sql, which is where those tables come into existence.
  customer_id   uuid,
  supplier_id   uuid,
  warehouse_id  uuid,
  item_id       uuid,
  stock_unit_id uuid,
  cost_centre   text,
  project_code  text,

  created_at    timestamptz not null default now(),

  unique (entry_id, line_no),
  -- A line is either a debit or a credit. Never both, never neither.
  constraint line_single_sided check (
    (debit_txn > 0 and credit_txn = 0) or (credit_txn > 0 and debit_txn = 0)
  ),
  -- The base amount must sit on the same side as the transaction amount.
  -- A base amount of zero is tolerated: a rate can legitimately round a
  -- sub-cent foreign amount to nothing.
  constraint line_sides_agree check (
    case when debit_txn > 0 then credit_base = 0 else debit_base = 0 end
  ),
  -- Same currency as the base means the two amounts must be identical.
  constraint line_base_matches_when_same_currency check (
    fx_rate <> 1 or (debit_txn = debit_base and credit_txn = credit_base)
  )
);

comment on table gl.journal_entry_line is
  'The ledger. Append-only. Every financial fact in the business is ultimately one of these rows.';
comment on column gl.journal_entry_line.fx_rate is
  'Rate applied to convert this line from currency_code into the entity base currency on entry_date.';
comment on column gl.journal_entry_line.stock_unit_id is
  'Serial-tracked unit this line relates to. Lets an auditor trace the cost of one physical part through the ledger.';

create index jel_account_period_idx on gl.journal_entry_line (entity_id, account_id, period_id);
create index jel_account_date_idx on gl.journal_entry_line (entity_id, account_id, entry_date);
create index jel_entry_idx on gl.journal_entry_line (entry_id, line_no);
create index jel_customer_idx on gl.journal_entry_line (entity_id, customer_id, entry_date)
  where customer_id is not null;
create index jel_supplier_idx on gl.journal_entry_line (entity_id, supplier_id, entry_date)
  where supplier_id is not null;
create index jel_item_idx on gl.journal_entry_line (entity_id, item_id, entry_date)
  where item_id is not null;
create index jel_currency_idx on gl.journal_entry_line (entity_id, currency_code)
  where currency_code <> 'KES';

-- ---------------------------------------------------------------------------
-- Invariant 3: entries balance, checked at COMMIT
--
-- The check is deferred because a multi-line entry is necessarily unbalanced
-- part-way through being written. Deferring to commit means the check sees the
-- finished entry, and no amount of clever inserting can get an unbalanced
-- entry past it.
--
-- Two rules apply:
--   * Base currency must always balance. This is absolute.
--   * When every line of an entry shares one currency, that currency must
--     balance too. This catches transposition errors in ordinary entries
--     without producing false failures on genuine cross-currency transactions
--     such as settling a USD supplier bill from a KES bank account, which
--     balance in base currency only.
-- ---------------------------------------------------------------------------

create or replace function gl.assert_entry_balanced(p_entry_id uuid)
returns void
language plpgsql
as $$
declare
  v_debit_base    app.money_amount;
  v_credit_base   app.money_amount;
  v_line_count    integer;
  v_currencies    integer;
  v_debit_txn     app.money_amount;
  v_credit_txn    app.money_amount;
  v_entry_no      text;
begin
  select je.entry_no into v_entry_no from gl.journal_entry je where je.id = p_entry_id;
  if v_entry_no is null then
    -- The entry was rolled back; nothing to prove.
    return;
  end if;

  select
      count(*),
      coalesce(sum(l.debit_base), 0),
      coalesce(sum(l.credit_base), 0),
      count(distinct l.currency_code),
      coalesce(sum(l.debit_txn), 0),
      coalesce(sum(l.credit_txn), 0)
    into v_line_count, v_debit_base, v_credit_base, v_currencies, v_debit_txn, v_credit_txn
    from gl.journal_entry_line l
   where l.entry_id = p_entry_id;

  if v_line_count = 0 then
    raise exception 'Journal entry % has no lines', v_entry_no
      using errcode = 'restrict_violation';
  end if;

  if v_line_count < 2 then
    raise exception 'Journal entry % has a single line; double entry requires at least two', v_entry_no
      using errcode = 'restrict_violation';
  end if;

  if v_debit_base <> v_credit_base then
    raise exception
      'Journal entry % does not balance in base currency: debits %, credits %, difference %',
      v_entry_no, v_debit_base, v_credit_base, v_debit_base - v_credit_base
      using errcode = 'restrict_violation';
  end if;

  if v_currencies = 1 and v_debit_txn <> v_credit_txn then
    raise exception
      'Journal entry % does not balance in transaction currency: debits %, credits %',
      v_entry_no, v_debit_txn, v_credit_txn
      using errcode = 'restrict_violation';
  end if;

  -- The header totals are what reports read; they must not drift from detail.
  if exists (
    select 1 from gl.journal_entry je
     where je.id = p_entry_id
       and (je.total_debit_base <> v_debit_base
         or je.total_credit_base <> v_credit_base
         or je.line_count <> v_line_count)
  ) then
    raise exception
      'Journal entry % header totals disagree with its lines (lines: % debit, % credit, % lines)',
      v_entry_no, v_debit_base, v_credit_base, v_line_count
      using errcode = 'restrict_violation';
  end if;
end;
$$;

create or replace function gl.fn_check_balance_from_line()
returns trigger
language plpgsql
as $$
begin
  perform gl.assert_entry_balanced(new.entry_id);
  return null;
end;
$$;

create or replace function gl.fn_check_balance_from_header()
returns trigger
language plpgsql
as $$
begin
  perform gl.assert_entry_balanced(new.id);
  return null;
end;
$$;

create constraint trigger journal_entry_line_balanced
  after insert on gl.journal_entry_line
  deferrable initially deferred
  for each row execute function gl.fn_check_balance_from_line();

create constraint trigger journal_entry_balanced
  after insert on gl.journal_entry
  deferrable initially deferred
  for each row execute function gl.fn_check_balance_from_header();

-- Keeps the denormalised date and period on the line honest.
create or replace function gl.fn_line_inherits_header()
returns trigger
language plpgsql
as $$
declare
  v_entry gl.journal_entry%rowtype;
begin
  select * into v_entry from gl.journal_entry where id = new.entry_id;

  if not found then
    raise exception 'Journal line references a journal entry that does not exist';
  end if;

  new.entity_id  := v_entry.entity_id;
  new.entry_date := v_entry.entry_date;
  new.period_id  := v_entry.period_id;

  return new;
end;
$$;

create trigger journal_entry_line_inherits_header
  before insert on gl.journal_entry_line
  for each row execute function gl.fn_line_inherits_header();

-- Invariant 2: the ledger is append-only.
select app.enable_append_only('gl.journal_entry');
select app.enable_append_only('gl.journal_entry_line');

-- ---------------------------------------------------------------------------
-- Period balances
--
-- Maintained incrementally on insert so the trial balance is a lookup rather
-- than a scan of the whole ledger. Because ledger lines are append-only, an
-- insert-only trigger is sufficient and can never fall out of step.
-- ---------------------------------------------------------------------------

create table gl.account_balance_period (
  entity_id     uuid    not null references app.entities (id) on delete restrict,
  account_id    uuid    not null references gl.accounts (id) on delete restrict,
  period_id     uuid    not null references gl.fiscal_periods (id) on delete restrict,
  currency_code char(3) not null references app.currencies (code),
  debit_txn     app.money_amount not null default 0,
  credit_txn    app.money_amount not null default 0,
  debit_base    app.money_amount not null default 0,
  credit_base   app.money_amount not null default 0,
  line_count    integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (entity_id, account_id, period_id, currency_code)
);

comment on table gl.account_balance_period is
  'Movement per account, period and currency. Derived data: it can always be rebuilt with gl.rebuild_account_balances().';

create index abp_period_idx on gl.account_balance_period (entity_id, period_id);

create or replace function gl.fn_accumulate_balance()
returns trigger
language plpgsql
as $$
begin
  insert into gl.account_balance_period as b (
    entity_id, account_id, period_id, currency_code,
    debit_txn, credit_txn, debit_base, credit_base, line_count
  )
  values (
    new.entity_id, new.account_id, new.period_id, new.currency_code,
    new.debit_txn, new.credit_txn, new.debit_base, new.credit_base, 1
  )
  on conflict (entity_id, account_id, period_id, currency_code) do update
    set debit_txn   = b.debit_txn   + excluded.debit_txn,
        credit_txn  = b.credit_txn  + excluded.credit_txn,
        debit_base  = b.debit_base  + excluded.debit_base,
        credit_base = b.credit_base + excluded.credit_base,
        line_count  = b.line_count  + 1,
        updated_at  = now();

  return null;
end;
$$;

create trigger journal_entry_line_accumulate
  after insert on gl.journal_entry_line
  for each row execute function gl.fn_accumulate_balance();

-- Rebuild from the ledger. Used by the reconciliation test and available as a
-- recovery tool if the summary is ever suspected of drifting.
create or replace function gl.rebuild_account_balances(p_entity_id uuid)
returns bigint
language plpgsql
as $$
declare
  v_rows bigint;
begin
  delete from gl.account_balance_period where entity_id = p_entity_id;

  insert into gl.account_balance_period (
    entity_id, account_id, period_id, currency_code,
    debit_txn, credit_txn, debit_base, credit_base, line_count
  )
  select l.entity_id, l.account_id, l.period_id, l.currency_code,
         sum(l.debit_txn), sum(l.credit_txn), sum(l.debit_base), sum(l.credit_base), count(*)
    from gl.journal_entry_line l
   where l.entity_id = p_entity_id
   group by l.entity_id, l.account_id, l.period_id, l.currency_code;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting views
-- ---------------------------------------------------------------------------

-- Entries with their reversal state resolved. The base tables stay immutable;
-- "this entry was reversed" is a derived fact, not a column someone updates.
create or replace view gl.v_journal_entry as
select
  je.*,
  rev.id       as reversed_by_entry_id,
  rev.entry_no as reversed_by_entry_no,
  (rev.id is not null) as is_reversed,
  (je.reversal_of_entry_id is not null) as is_reversal
from gl.journal_entry je
left join gl.journal_entry as rev on rev.reversal_of_entry_id = je.id;

-- Trial balance for a single period, with opening and closing positions.
-- Opening is the cumulative movement of every earlier period in the same
-- fiscal year for balance sheet accounts, and of the whole year to date for
-- profit and loss accounts.
create or replace function gl.trial_balance(p_entity_id uuid, p_period_id uuid)
returns table (
  account_id       uuid,
  account_code     text,
  account_name     text,
  account_type     gl.account_type,
  normal_balance   gl.balance_side,
  opening_base     app.money_amount,
  period_debit     app.money_amount,
  period_credit    app.money_amount,
  closing_base     app.money_amount
)
language sql
stable
as $$
  with target as (
    select p.id, p.entity_id, p.fiscal_year_id, p.start_date, p.end_date
      from gl.fiscal_periods p
     where p.id = p_period_id and p.entity_id = p_entity_id
  ),
  prior as (
    select b.account_id,
           sum(b.debit_base - b.credit_base) as net_base
      from gl.account_balance_period b
      join gl.fiscal_periods p on p.id = b.period_id
      join target t on true
     where b.entity_id = p_entity_id
       and p.end_date < t.start_date
       and (
         -- Profit and loss resets each fiscal year; the balance sheet does not.
         p.fiscal_year_id = t.fiscal_year_id
         or exists (
           select 1 from gl.accounts a
            where a.id = b.account_id
              and a.account_type in ('ASSET', 'LIABILITY', 'EQUITY')
         )
       )
     group by b.account_id
  ),
  movement as (
    select b.account_id,
           sum(b.debit_base)  as debit_base,
           sum(b.credit_base) as credit_base
      from gl.account_balance_period b
     where b.entity_id = p_entity_id
       and b.period_id = p_period_id
     group by b.account_id
  )
  select
    a.id,
    a.code,
    a.name,
    a.account_type,
    a.normal_balance,
    coalesce(prior.net_base, 0)::app.money_amount,
    coalesce(movement.debit_base, 0)::app.money_amount,
    coalesce(movement.credit_base, 0)::app.money_amount,
    (coalesce(prior.net_base, 0)
      + coalesce(movement.debit_base, 0)
      - coalesce(movement.credit_base, 0))::app.money_amount
  from gl.accounts a
  left join prior on prior.account_id = a.id
  left join movement on movement.account_id = a.id
  where a.entity_id = p_entity_id
    and (prior.account_id is not null or movement.account_id is not null)
  order by a.code;
$$;

comment on function gl.trial_balance(uuid, uuid) is
  'Opening, movement and closing per account. The sum of closing_base across all rows must always be exactly zero.';

-- Account balance as at an arbitrary date, used by statements and ageing.
create or replace function gl.account_balance_as_at(
  p_entity_id  uuid,
  p_account_id uuid,
  p_as_at      date
)
returns app.money_amount
language sql
stable
as $$
  select coalesce(sum(l.debit_base - l.credit_base), 0)::app.money_amount
    from gl.journal_entry_line l
   where l.entity_id = p_entity_id
     and l.account_id = p_account_id
     and l.entry_date <= p_as_at;
$$;

select app.enable_updated_at('gl.fiscal_years');
select app.enable_updated_at('gl.fiscal_periods');
select app.enable_updated_at('gl.accounts');

select app.enable_audit('app.fx_rates');
select app.enable_audit('gl.fiscal_years');
select app.enable_audit('gl.fiscal_periods');
select app.enable_audit('gl.accounts');
select app.enable_audit('gl.entity_account_settings');

-- The journal is audited by its own immutability: the rows are the record.
-- Auditing them again would double the write volume for no added assurance.
