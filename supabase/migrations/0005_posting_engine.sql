-- ===========================================================================
-- 0005_posting_engine.sql
--
-- The only way into the ledger.
--
-- Invariant 4: no business document writes to gl.journal_entry_line. Every
-- posting in the system, from a manual journal to the cost of sales on a
-- despatched part, goes through gl.post_entry. The privilege grants at the
-- foot of this file make that structural rather than a matter of discipline:
-- the role the application connects as has no INSERT privilege on the ledger
-- at all, and could not bypass this function if it tried.
--
-- inv.post_movement lives here too. Invariant 8 requires a stock movement and
-- its valuation to be one transaction, so inventory posting is part of the
-- posting engine, not a separate concern that happens to call it.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Which numbering series a posting draws from
-- ---------------------------------------------------------------------------

create or replace function gl.document_type_for_source(p_source_type text)
returns text
language sql
immutable
as $$
  select case p_source_type
    when 'MANUAL'          then 'JE'
    when 'OPENING_BALANCE' then 'OB'
    when 'REVERSAL'        then 'REV'
    when 'FX_REVALUATION'  then 'FXR'
    when 'YEAR_END_CLOSE'  then 'YEC'
    when 'STOCK_MOVEMENT'  then 'STK'
    else 'JE'
  end;
$$;

-- ---------------------------------------------------------------------------
-- gl.post_entry
--
-- Payload shape:
--   {
--     "entry_date":         "2026-01-31",          -- required
--     "source_type":        "MANUAL",              -- required, gl.journal_sources
--     "source_id":          null,
--     "source_document_no": null,
--     "description":        "...",                 -- required
--     "memo":               null,
--     "reversal_of_entry_id": null,
--     "reversal_reason":    null,
--     "lines": [
--       {
--         "account_id":    "uuid",   -- or "account_code": "1200"
--         "currency_code": "USD",    -- defaults to the entity base currency
--         "fx_rate":       130.5,    -- defaults to the published rate for the date
--         "debit":         100.00,   -- exactly one of debit / credit must be positive
--         "credit":        0,
--         "debit_base":    13050.00, -- system sources only; see below
--         "credit_base":   0,
--         "memo":          "...",
--         "customer_id":   null, "supplier_id": null, "warehouse_id": null,
--         "item_id":       null, "stock_unit_id": null,
--         "cost_centre":   null, "project_code": null
--       }
--     ]
--   }
--
-- Explicit base amounts are accepted only from system sources. A reversal must
-- cancel the original at the original rate, not at today's rate, or the pair
-- would not net to zero and the reversal would silently book an FX movement.
-- ---------------------------------------------------------------------------

create or replace function gl.post_entry(
  p_entity_id       uuid,
  p_payload         jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_entity          app.entities%rowtype;
  v_entry_date      date;
  v_source_type     text;
  v_description     text;
  v_period_id       uuid;
  v_base_currency   char(3);
  v_existing_id     uuid;
  v_entry_id        uuid;
  v_entry_no        text;
  v_document_type   text;
  v_actor           uuid;
  v_trusted_source  boolean;

  v_line            jsonb;
  v_lines           jsonb := '[]'::jsonb;
  v_line_no         integer := 0;

  v_account         gl.accounts%rowtype;
  v_currency        char(3);
  v_rate            app.fx_rate;
  v_debit_txn       app.money_amount;
  v_credit_txn      app.money_amount;
  v_debit_base      app.money_amount;
  v_credit_base     app.money_amount;

  v_total_debit     app.money_amount;
  v_total_credit    app.money_amount;
  v_imbalance       app.money_amount;
  v_tolerance       app.money_amount;
  v_rounding_acct   uuid;
begin
  -- -------------------------------------------------------------------------
  -- Idempotency (invariant 5)
  --
  -- Checked first and returned early. A retried request must observe the
  -- original outcome, not a second entry and not an error.
  -- -------------------------------------------------------------------------
  if p_idempotency_key is not null then
    select id into v_existing_id
      from gl.journal_entry
     where entity_id = p_entity_id
       and idempotency_key = p_idempotency_key;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Header validation
  -- -------------------------------------------------------------------------
  select * into v_entity from app.entities where id = p_entity_id;
  if not found then
    raise exception 'Entity % does not exist', p_entity_id using errcode = 'no_data_found';
  end if;
  if not v_entity.is_active then
    raise exception 'Entity % is not active; postings are not accepted', v_entity.code
      using errcode = 'restrict_violation';
  end if;

  v_base_currency := v_entity.base_currency_code;

  v_entry_date := (p_payload ->> 'entry_date')::date;
  if v_entry_date is null then
    raise exception 'entry_date is required' using errcode = 'null_value_not_allowed';
  end if;

  v_source_type := coalesce(p_payload ->> 'source_type', 'MANUAL');
  if not exists (select 1 from gl.journal_sources where code = v_source_type) then
    raise exception 'Unknown journal source %', v_source_type using errcode = 'foreign_key_violation';
  end if;

  v_description := btrim(coalesce(p_payload ->> 'description', ''));
  if v_description = '' then
    raise exception 'description is required; an unexplained journal entry is not auditable'
      using errcode = 'null_value_not_allowed';
  end if;

  -- A person posting a manual journal needs the permission to do so. System
  -- sources are reached only through code paths that have already checked the
  -- permission appropriate to the business action.
  if v_source_type = 'MANUAL' then
    perform app.require_permission(p_entity_id, 'gl.post_journal');
  end if;

  v_trusted_source := v_source_type <> 'MANUAL';
  v_actor := app.acting_user_id();

  -- Invariant 7.
  v_period_id := gl.assert_period_open(p_entity_id, v_entry_date);

  if jsonb_typeof(p_payload -> 'lines') <> 'array'
     or jsonb_array_length(p_payload -> 'lines') = 0 then
    raise exception 'At least one journal line is required' using errcode = 'null_value_not_allowed';
  end if;

  -- -------------------------------------------------------------------------
  -- Line normalisation
  -- -------------------------------------------------------------------------
  for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
  loop
    v_line_no := v_line_no + 1;

    -- Account, by id or by code.
    if nullif(v_line ->> 'account_id', '') is not null then
      select * into v_account
        from gl.accounts
       where id = (v_line ->> 'account_id')::uuid;
    elsif nullif(v_line ->> 'account_code', '') is not null then
      select * into v_account
        from gl.accounts
       where entity_id = p_entity_id and code = v_line ->> 'account_code';
    else
      raise exception 'Line %: account_id or account_code is required', v_line_no
        using errcode = 'null_value_not_allowed';
    end if;

    if not found then
      raise exception 'Line %: account % was not found',
        v_line_no, coalesce(v_line ->> 'account_code', v_line ->> 'account_id')
        using errcode = 'no_data_found';
    end if;
    if v_account.entity_id <> p_entity_id then
      raise exception 'Line %: account % belongs to a different entity', v_line_no, v_account.code;
    end if;
    if not v_account.is_active then
      raise exception 'Line %: account % - % is inactive', v_line_no, v_account.code, v_account.name
        using errcode = 'restrict_violation';
    end if;
    if not v_account.is_postable then
      raise exception 'Line %: account % - % is a summary account and cannot take postings',
        v_line_no, v_account.code, v_account.name
        using errcode = 'restrict_violation';
    end if;

    -- Control accounts belong to their sub-ledger. Letting a person journal
    -- directly against receivables is how a control account stops agreeing
    -- with the customer detail behind it.
    if v_account.control_type is not null and not v_trusted_source then
      perform app.require_permission(p_entity_id, 'gl.post_to_control_account');
    end if;

    -- Amounts in the transaction currency.
    v_debit_txn  := round(coalesce((v_line ->> 'debit')::numeric, 0), 4);
    v_credit_txn := round(coalesce((v_line ->> 'credit')::numeric, 0), 4);

    if v_debit_txn < 0 or v_credit_txn < 0 then
      raise exception 'Line %: amounts must be positive. Post to the other side instead of using a negative.',
        v_line_no
        using errcode = 'check_violation';
    end if;
    if (v_debit_txn > 0) = (v_credit_txn > 0) then
      raise exception 'Line %: exactly one of debit or credit must be greater than zero', v_line_no
        using errcode = 'check_violation';
    end if;

    -- Currency and rate.
    v_currency := coalesce(nullif(v_line ->> 'currency_code', ''), v_base_currency);
    -- A currency-restricted account holds one currency and one only, so that a
    -- KES payment cannot be booked into the USD bank account. The single
    -- exception is a base-currency line from a system source: period-end
    -- revaluation adjusts the base value of a foreign balance without moving
    -- the foreign balance itself, and has nowhere else to post.
    if v_account.currency_code is not null
       and v_account.currency_code <> v_currency
       and not (v_trusted_source and v_currency = v_base_currency) then
      raise exception 'Line %: account % only holds %, but the line is denominated in %',
        v_line_no, v_account.code, v_account.currency_code, v_currency
        using errcode = 'check_violation';
    end if;

    if v_currency = v_base_currency then
      v_rate := 1;
    elsif nullif(v_line ->> 'fx_rate', '') is not null then
      v_rate := (v_line ->> 'fx_rate')::numeric;
    else
      v_rate := app.fx_rate_on(p_entity_id, v_currency, v_base_currency, v_entry_date, 'SPOT');
    end if;

    -- Base amounts. Supplied verbatim for system sources, otherwise derived.
    if v_trusted_source and (
         nullif(v_line ->> 'debit_base', '') is not null
      or nullif(v_line ->> 'credit_base', '') is not null
    ) then
      v_debit_base  := round(coalesce((v_line ->> 'debit_base')::numeric, 0), 4);
      v_credit_base := round(coalesce((v_line ->> 'credit_base')::numeric, 0), 4);
      if (v_debit_txn > 0 and v_credit_base <> 0)
         or (v_credit_txn > 0 and v_debit_base <> 0) then
        raise exception 'Line %: the supplied base amount is on the opposite side to the transaction amount',
          v_line_no
          using errcode = 'check_violation';
      end if;
    else
      v_debit_base  := round(v_debit_txn * v_rate, 4);
      v_credit_base := round(v_credit_txn * v_rate, 4);
    end if;

    -- Dimensions demanded by the account.
    if v_account.requires_customer and nullif(v_line ->> 'customer_id', '') is null then
      raise exception 'Line %: account % requires a customer', v_line_no, v_account.code
        using errcode = 'null_value_not_allowed';
    end if;
    if v_account.requires_supplier and nullif(v_line ->> 'supplier_id', '') is null then
      raise exception 'Line %: account % requires a supplier', v_line_no, v_account.code
        using errcode = 'null_value_not_allowed';
    end if;
    if v_account.requires_warehouse and nullif(v_line ->> 'warehouse_id', '') is null then
      raise exception 'Line %: account % requires a warehouse', v_line_no, v_account.code
        using errcode = 'null_value_not_allowed';
    end if;
    if v_account.requires_item and nullif(v_line ->> 'item_id', '') is null then
      raise exception 'Line %: account % requires an item', v_line_no, v_account.code
        using errcode = 'null_value_not_allowed';
    end if;

    v_lines := v_lines || jsonb_build_object(
      'line_no',       v_line_no,
      'account_id',    v_account.id,
      'currency_code', v_currency,
      'fx_rate',       v_rate,
      'debit_txn',     v_debit_txn,
      'credit_txn',    v_credit_txn,
      'debit_base',    v_debit_base,
      'credit_base',   v_credit_base,
      'memo',          nullif(v_line ->> 'memo', ''),
      'customer_id',   nullif(v_line ->> 'customer_id', ''),
      'supplier_id',   nullif(v_line ->> 'supplier_id', ''),
      'warehouse_id',  nullif(v_line ->> 'warehouse_id', ''),
      'item_id',       nullif(v_line ->> 'item_id', ''),
      'stock_unit_id', nullif(v_line ->> 'stock_unit_id', ''),
      'cost_centre',   nullif(v_line ->> 'cost_centre', ''),
      'project_code',  nullif(v_line ->> 'project_code', '')
    );
  end loop;

  -- -------------------------------------------------------------------------
  -- Balance, and the rounding line
  --
  -- A foreign currency entry that balances exactly in its own currency will
  -- frequently be a cent out once each line is translated and rounded
  -- independently. That residue is a translation artefact, not an error, and
  -- is posted to the rounding account. Anything larger than a plausible
  -- rounding residue is a real imbalance and is refused.
  -- -------------------------------------------------------------------------
  select coalesce(sum((l ->> 'debit_base')::numeric), 0),
         coalesce(sum((l ->> 'credit_base')::numeric), 0)
    into v_total_debit, v_total_credit
    from jsonb_array_elements(v_lines) l;

  v_imbalance := v_total_debit - v_total_credit;

  if v_imbalance <> 0 then
    v_tolerance := greatest(0.05, 0.01 * v_line_no);

    if abs(v_imbalance) > v_tolerance then
      raise exception
        'Entry does not balance: debits %, credits %, difference %. Tolerance for rounding is %.',
        v_total_debit, v_total_credit, v_imbalance, v_tolerance
        using errcode = 'check_violation';
    end if;

    v_rounding_acct := gl.setting_account(p_entity_id, 'ROUNDING');
    v_line_no := v_line_no + 1;

    v_lines := v_lines || jsonb_build_object(
      'line_no',       v_line_no,
      'account_id',    v_rounding_acct,
      'currency_code', v_base_currency,
      'fx_rate',       1,
      'debit_txn',     case when v_imbalance < 0 then abs(v_imbalance) else 0 end,
      'credit_txn',    case when v_imbalance > 0 then v_imbalance else 0 end,
      'debit_base',    case when v_imbalance < 0 then abs(v_imbalance) else 0 end,
      'credit_base',   case when v_imbalance > 0 then v_imbalance else 0 end,
      'memo',          'Currency translation rounding'
    );

    if v_imbalance < 0 then
      v_total_debit := v_total_debit + abs(v_imbalance);
    else
      v_total_credit := v_total_credit + v_imbalance;
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- Persist
  -- -------------------------------------------------------------------------
  v_document_type := coalesce(
    nullif(p_payload ->> 'document_type', ''),
    gl.document_type_for_source(v_source_type)
  );
  v_entry_no := app.next_document_number(p_entity_id, v_document_type, v_entry_date);

  insert into gl.journal_entry (
    entity_id, entry_no, entry_date, period_id,
    source_type, source_id, source_document_no,
    description, memo, base_currency_code,
    total_debit_base, total_credit_base, line_count,
    reversal_of_entry_id, reversal_reason,
    idempotency_key, posted_by
  )
  values (
    p_entity_id, v_entry_no, v_entry_date, v_period_id,
    v_source_type,
    nullif(p_payload ->> 'source_id', '')::uuid,
    nullif(p_payload ->> 'source_document_no', ''),
    v_description,
    nullif(p_payload ->> 'memo', ''),
    v_base_currency,
    v_total_debit, v_total_credit, v_line_no,
    nullif(p_payload ->> 'reversal_of_entry_id', '')::uuid,
    nullif(p_payload ->> 'reversal_reason', ''),
    p_idempotency_key,
    v_actor
  )
  returning id into v_entry_id;

  insert into gl.journal_entry_line (
    entry_id, entity_id, line_no, account_id, entry_date, period_id,
    currency_code, fx_rate, debit_txn, credit_txn, debit_base, credit_base,
    memo, customer_id, supplier_id, warehouse_id, item_id, stock_unit_id,
    cost_centre, project_code
  )
  select
    v_entry_id, p_entity_id, (l ->> 'line_no')::integer, (l ->> 'account_id')::uuid,
    v_entry_date, v_period_id,
    (l ->> 'currency_code')::char(3), (l ->> 'fx_rate')::numeric,
    (l ->> 'debit_txn')::numeric, (l ->> 'credit_txn')::numeric,
    (l ->> 'debit_base')::numeric, (l ->> 'credit_base')::numeric,
    l ->> 'memo',
    nullif(l ->> 'customer_id', '')::uuid,
    nullif(l ->> 'supplier_id', '')::uuid,
    nullif(l ->> 'warehouse_id', '')::uuid,
    nullif(l ->> 'item_id', '')::uuid,
    nullif(l ->> 'stock_unit_id', '')::uuid,
    l ->> 'cost_centre',
    l ->> 'project_code'
  from jsonb_array_elements(v_lines) l
  order by (l ->> 'line_no')::integer;

  return v_entry_id;
end;
$$;

comment on function gl.post_entry(uuid, jsonb, text) is
  'The sole write path into the general ledger (invariant 4). Validates period, accounts, currency, dimensions and balance, allocates a gapless number, and writes header and lines in one transaction.';

-- ---------------------------------------------------------------------------
-- gl.reverse_entry
--
-- Invariant 2 in practice: nothing is ever edited or deleted, so a mistake is
-- corrected by posting its mirror image. The reversal uses the base amounts of
-- the original rather than re-translating, so the pair nets to exactly zero.
-- ---------------------------------------------------------------------------

create or replace function gl.reverse_entry(
  p_entry_id        uuid,
  p_reason          text,
  p_reversal_date   date default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_entry     gl.journal_entry%rowtype;
  v_date      date;
  v_payload   jsonb;
  v_lines     jsonb;
  v_existing  uuid;
begin
  select * into v_entry from gl.journal_entry where id = p_entry_id;
  if not found then
    raise exception 'Journal entry % does not exist', p_entry_id using errcode = 'no_data_found';
  end if;

  -- Checked before the already-reversed guard below, so that a retried
  -- reversal request observes the reversal it created rather than being told
  -- the entry is already reversed - which is true, but is its own doing.
  if p_idempotency_key is not null then
    select id into v_existing
      from gl.journal_entry
     where entity_id = v_entry.entity_id
       and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  perform app.require_permission(v_entry.entity_id, 'gl.reverse_journal');

  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required to reverse an entry'
      using errcode = 'null_value_not_allowed';
  end if;

  if exists (select 1 from gl.journal_entry where reversal_of_entry_id = p_entry_id) then
    raise exception 'Journal entry % has already been reversed', v_entry.entry_no
      using errcode = 'unique_violation';
  end if;

  if v_entry.reversal_of_entry_id is not null then
    raise exception 'Journal entry % is itself a reversal and may not be reversed', v_entry.entry_no
      using errcode = 'restrict_violation';
  end if;

  -- Reverse into the original period when it is still open; otherwise the
  -- caller must nominate an open date, because silently moving a correction
  -- into a later period changes which period the numbers land in.
  v_date := coalesce(p_reversal_date, v_entry.entry_date);
  perform gl.assert_period_open(v_entry.entity_id, v_date);

  select jsonb_agg(
           jsonb_build_object(
             'account_id',    l.account_id,
             'currency_code', l.currency_code,
             'fx_rate',       l.fx_rate,
             'debit',         l.credit_txn,
             'credit',        l.debit_txn,
             'debit_base',    l.credit_base,
             'credit_base',   l.debit_base,
             'memo',          coalesce(l.memo, '') || ' (reversal)',
             'customer_id',   l.customer_id,
             'supplier_id',   l.supplier_id,
             'warehouse_id',  l.warehouse_id,
             'item_id',       l.item_id,
             'stock_unit_id', l.stock_unit_id,
             'cost_centre',   l.cost_centre,
             'project_code',  l.project_code
           )
           order by l.line_no
         )
    into v_lines
    from gl.journal_entry_line l
   where l.entry_id = p_entry_id;

  v_payload := jsonb_build_object(
    'entry_date',           v_date,
    'source_type',          'REVERSAL',
    'source_id',            v_entry.source_id,
    'source_document_no',   v_entry.source_document_no,
    'description',          'Reversal of ' || v_entry.entry_no || ': ' || v_entry.description,
    'memo',                 p_reason,
    'reversal_of_entry_id', p_entry_id,
    'reversal_reason',      p_reason,
    'lines',                v_lines
  );

  return gl.post_entry(v_entry.entity_id, v_payload, p_idempotency_key);
end;
$$;

comment on function gl.reverse_entry(uuid, text, date, text) is
  'Posts the mirror image of an entry at the original base amounts. The original is never touched.';

-- ---------------------------------------------------------------------------
-- inv.post_movement
--
-- Invariant 8: quantity and value move together, in one transaction, or not
-- at all. Every inventory transaction in every later phase - goods receipt,
-- picking, despatch, stock count, scrap - is a call to this function.
-- ---------------------------------------------------------------------------

create or replace function inv.post_movement(
  p_entity_id        uuid,
  p_item_id          uuid,
  p_warehouse_id     uuid,
  p_movement_type    inv.movement_type,
  p_movement_date    date,
  p_quantity         app.quantity,          -- signed: positive in, negative out
  p_bin_id           uuid default null,
  p_stock_unit_id    uuid default null,
  p_stock_lot_id     uuid default null,
  p_unit_cost_base   app.money_amount default null,
  p_offset_account_id uuid default null,
  p_source_type      text default 'MANUAL',
  p_source_id        uuid default null,
  p_source_line_id   uuid default null,
  p_reference        text default null,
  p_notes            text default null,
  p_idempotency_key  text default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_item            inv.items%rowtype;
  v_warehouse       inv.warehouses%rowtype;
  v_value           app.money_amount;
  v_unit_cost       app.money_amount;
  v_inventory_acct  uuid;
  v_offset_acct     uuid;
  v_entry_id        uuid;
  v_ledger_id       bigint;
  v_lines           jsonb;
  v_description     text;
begin
  if p_quantity = 0 then
    raise exception 'A stock movement of zero quantity is meaningless'
      using errcode = 'check_violation';
  end if;

  select * into v_item from inv.items where id = p_item_id and entity_id = p_entity_id;
  if not found then
    raise exception 'Item % does not exist on entity %', p_item_id, p_entity_id
      using errcode = 'no_data_found';
  end if;

  select * into v_warehouse from inv.warehouses where id = p_warehouse_id and entity_id = p_entity_id;
  if not found then
    raise exception 'Warehouse % does not exist on entity %', p_warehouse_id, p_entity_id
      using errcode = 'no_data_found';
  end if;

  perform gl.assert_period_open(p_entity_id, p_movement_date);

  -- Serialised parts move one at a time, and the unit must be identified.
  if v_item.tracking_mode = 'SERIAL' then
    if p_stock_unit_id is null then
      raise exception 'Item % is serial tracked; the stock unit must be identified', v_item.part_number
        using errcode = 'null_value_not_allowed';
    end if;
    if abs(p_quantity) <> 1 then
      raise exception 'Serialised movements are one unit at a time; received %', p_quantity
        using errcode = 'check_violation';
    end if;
  elsif v_item.tracking_mode = 'LOT' and p_stock_lot_id is null then
    raise exception 'Item % is lot tracked; the lot must be identified', v_item.part_number
      using errcode = 'null_value_not_allowed';
  end if;

  -- -------------------------------------------------------------------------
  -- Valuation
  -- -------------------------------------------------------------------------
  if v_warehouse.is_consignment then
    -- Held, not owned. Quantity is tracked; value stays off the balance sheet.
    v_value := 0;
    v_unit_cost := 0;
  elsif p_quantity > 0 then
    if p_unit_cost_base is null then
      raise exception 'An inbound movement must state its unit cost'
        using errcode = 'null_value_not_allowed';
    end if;
    v_unit_cost := round(p_unit_cost_base, 4);
    v_value     := round(v_unit_cost * p_quantity, 4);
  else
    v_value     := -inv.issue_cost(p_entity_id, p_item_id, p_warehouse_id, abs(p_quantity), p_stock_unit_id);
    v_unit_cost := round(abs(v_value) / abs(p_quantity), 4);
  end if;

  -- -------------------------------------------------------------------------
  -- Accounts
  -- -------------------------------------------------------------------------
  if v_value <> 0 then
    v_inventory_acct := coalesce(v_warehouse.inventory_account_id, inv.item_account(p_item_id, 'INVENTORY'));

    v_offset_acct := coalesce(
      p_offset_account_id,
      case p_movement_type
        when 'ISSUE'           then inv.item_account(p_item_id, 'COGS')
        when 'SCRAP'           then gl.setting_account(p_entity_id, 'INVENTORY_WRITE_OFF')
        when 'ADJUSTMENT_IN'   then gl.setting_account(p_entity_id, 'INVENTORY_ADJUSTMENT')
        when 'ADJUSTMENT_OUT'  then gl.setting_account(p_entity_id, 'INVENTORY_ADJUSTMENT')
        when 'REVALUATION'     then gl.setting_account(p_entity_id, 'INVENTORY_ADJUSTMENT')
        when 'OPENING'         then gl.setting_account(p_entity_id, 'OPENING_BALANCE_SUSPENSE')
        when 'RECEIPT'         then gl.setting_account(p_entity_id, 'GOODS_RECEIVED_NOT_INVOICED')
        when 'SUPPLIER_RETURN' then gl.setting_account(p_entity_id, 'GOODS_RECEIVED_NOT_INVOICED')
        when 'CUSTOMER_RETURN' then inv.item_account(p_item_id, 'COGS')
        when 'TRANSFER_OUT'    then gl.setting_account(p_entity_id, 'INVENTORY_IN_TRANSIT')
        when 'TRANSFER_IN'     then gl.setting_account(p_entity_id, 'INVENTORY_IN_TRANSIT')
      end
    );

    if v_offset_acct is null then
      raise exception 'No contra account could be determined for a % movement', p_movement_type
        using errcode = 'null_value_not_allowed';
    end if;

    v_description := format('%s: %s x %s', p_movement_type, v_item.part_number, p_quantity);

    -- Stock increasing debits inventory; stock leaving credits it.
    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id',    case when v_value > 0 then v_inventory_acct else v_offset_acct end,
        'debit',         abs(v_value),
        'credit',        0,
        'memo',          v_description,
        'item_id',       p_item_id,
        'warehouse_id',  p_warehouse_id,
        'stock_unit_id', p_stock_unit_id
      ),
      jsonb_build_object(
        'account_id',    case when v_value > 0 then v_offset_acct else v_inventory_acct end,
        'debit',         0,
        'credit',        abs(v_value),
        'memo',          v_description,
        'item_id',       p_item_id,
        'warehouse_id',  p_warehouse_id,
        'stock_unit_id', p_stock_unit_id
      )
    );

    v_entry_id := gl.post_entry(
      p_entity_id,
      jsonb_build_object(
        'entry_date',         p_movement_date,
        'source_type',        'STOCK_MOVEMENT',
        'source_id',          p_source_id,
        'source_document_no', p_reference,
        'description',        v_description,
        'memo',               p_notes,
        'lines',              v_lines
      ),
      case when p_idempotency_key is not null then p_idempotency_key || ':gl' else null end
    );
  end if;

  insert into inv.stock_ledger (
    entity_id, item_id, warehouse_id, bin_id, stock_unit_id, stock_lot_id,
    movement_type, movement_date, quantity, unit_cost_base, value_base,
    journal_entry_id, source_type, source_id, source_line_id, reference, notes, created_by
  )
  values (
    p_entity_id, p_item_id, p_warehouse_id, p_bin_id, p_stock_unit_id, p_stock_lot_id,
    p_movement_type, p_movement_date, p_quantity, v_unit_cost, v_value,
    v_entry_id, p_source_type, p_source_id, p_source_line_id, p_reference, p_notes,
    app.acting_user_id()
  )
  returning id into v_ledger_id;

  -- Keep the physical record of a serialised unit in step with its movement.
  if p_stock_unit_id is not null then
    if p_quantity > 0 then
      update inv.stock_units
         set warehouse_id   = p_warehouse_id,
             bin_id         = coalesce(p_bin_id, bin_id),
             status         = 'ON_HAND',
             unit_cost_base = case when v_warehouse.is_consignment then unit_cost_base else v_unit_cost end
       where id = p_stock_unit_id;
    else
      update inv.stock_units
         set status = case p_movement_type
                        when 'SCRAP'           then 'SCRAPPED'::inv.stock_unit_status
                        when 'SUPPLIER_RETURN' then 'RETURNED'::inv.stock_unit_status
                        when 'ISSUE'           then 'DELIVERED'::inv.stock_unit_status
                        when 'TRANSFER_OUT'    then 'IN_TRANSIT'::inv.stock_unit_status
                        else 'CONSUMED'::inv.stock_unit_status
                      end,
             bin_id = null
       where id = p_stock_unit_id;
    end if;
  end if;

  return v_ledger_id;
end;
$$;

comment on function inv.post_movement is
  'Records a stock movement and the journal entry that values it, atomically (invariant 8).';

-- ===========================================================================
-- Privilege lockdown
--
-- This is what makes invariant 4 structural. skyjet_app is the role the
-- application connects as. It can read the ledger and it can call the posting
-- functions, which run as their owner. It cannot write a ledger row directly,
-- so no future bug, no ORM, and no well-intentioned hotfix can put an
-- unbalanced or unattributed row into the general ledger.
--
-- skyjet_app is deliberately NOLOGIN. The login role is created outside
-- version control and granted membership, so that no password ever appears in
-- a migration. supabase/seed.sql does this for local development only.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'skyjet_app') then
    create role skyjet_app nologin;
  end if;
end;
$$;

comment on role skyjet_app is
  'Application role. Read access to business data, execute access to the posting engine, no direct DML on any ledger.';

grant usage on schema app, gl, inv, audit to skyjet_app;

-- Read everything, write nothing by default.
grant select on all tables in schema app, gl, inv, audit to skyjet_app;

alter default privileges in schema app, gl, inv, audit
  grant select on tables to skyjet_app;

-- The append-only ledgers and their derived summaries are readable only.
revoke insert, update, delete, truncate on
  gl.journal_entry,
  gl.journal_entry_line,
  gl.account_balance_period,
  inv.stock_ledger,
  inv.stock_balances,
  audit.log
from skyjet_app, public;

-- Nobody rewrites history, whatever role they hold.
revoke update, delete, truncate on
  gl.journal_entry,
  gl.journal_entry_line,
  inv.stock_ledger,
  audit.log
from authenticated, anon;

-- Master data is maintained through ordinary DML, guarded by RLS and by the
-- application permission layer. The ledger is not.
grant insert, update on
  app.entities, app.users, app.roles, app.role_permissions, app.user_roles,
  app.payment_terms, app.addresses, app.contacts, app.tax_codes,
  app.customers, app.suppliers, app.attachments, app.attachment_links,
  app.currencies, app.fx_rates, app.numbering_sequences, app.idempotency_keys,
  gl.accounts, gl.entity_account_settings, gl.fiscal_years, gl.fiscal_periods,
  inv.warehouses, inv.bins, inv.manufacturers, inv.item_categories,
  inv.items, inv.item_alternate_numbers, inv.stock_units, inv.stock_lots,
  inv.certificates
to skyjet_app;

grant execute on function
  gl.post_entry(uuid, jsonb, text),
  gl.reverse_entry(uuid, text, date, text),
  inv.post_movement(uuid, uuid, uuid, inv.movement_type, date, app.quantity, uuid, uuid, uuid,
                    app.money_amount, uuid, text, uuid, uuid, text, text, text)
to skyjet_app;

grant execute on function
  app.next_document_number(uuid, text, date),
  app.require_permission(uuid, text),
  app.user_has_permission(uuid, text, uuid),
  app.user_has_entity_access(uuid, uuid),
  app.acting_user_id(),
  gl.assert_period_open(uuid, date),
  gl.period_for_date(uuid, date),
  gl.trial_balance(uuid, uuid),
  gl.account_balance_as_at(uuid, uuid, date),
  gl.setting_account(uuid, text),
  app.fx_rate_on(uuid, char, char, date, text),
  inv.issue_cost(uuid, uuid, uuid, app.quantity, uuid),
  inv.current_average_cost(uuid, uuid, uuid),
  inv.item_account(uuid, text),
  inv.unit_is_releasable(uuid, date),
  inv.verify_inventory_ties_to_gl(uuid, date)
to skyjet_app;
