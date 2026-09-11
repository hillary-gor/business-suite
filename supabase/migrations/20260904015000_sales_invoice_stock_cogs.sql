-- ===========================================================================
-- Sales invoice stock issue + COGS
--
-- When an issued invoice line references a stocked item, sales.issue_invoice
-- calls inv.post_movement(ISSUE) in the same transaction as the AR posting.
-- Serial lines require stock_unit_id; lot lines require stock_lot_id.
-- Void restores stock via CUSTOMER_RETURN using the original unit cost.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

alter table sales.invoices
  add column if not exists warehouse_id uuid references inv.warehouses (id) on delete restrict;

comment on column sales.invoices.warehouse_id is
  'Warehouse stock leaves from when stocked lines are issued. Required at issue if any line is stocked.';

alter table sales.invoice_lines
  add column if not exists stock_unit_id uuid references inv.stock_units (id) on delete restrict,
  add column if not exists stock_lot_id  uuid references inv.stock_lots (id) on delete restrict;

comment on column sales.invoice_lines.stock_unit_id is
  'Required when the line item is SERIAL tracked and stocked.';
comment on column sales.invoice_lines.stock_lot_id is
  'Required when the line item is LOT tracked and stocked.';

create index if not exists invoices_warehouse_idx on sales.invoices (entity_id, warehouse_id);
create index if not exists invoice_lines_stock_unit_idx on sales.invoice_lines (stock_unit_id)
  where stock_unit_id is not null;
create index if not exists invoice_lines_stock_lot_idx on sales.invoice_lines (stock_lot_id)
  where stock_lot_id is not null;

-- ---------------------------------------------------------------------------
-- save_invoice: persist warehouse + stock identity on lines
-- ---------------------------------------------------------------------------

create or replace function sales.save_invoice(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id         uuid := nullif(p_payload ->> 'invoice_id', '')::uuid;
  v_customer   uuid := (p_payload ->> 'customer_id')::uuid;
  v_date       date := (p_payload ->> 'invoice_date')::date;
  v_due        date;
  v_currency   char(3);
  v_terms      uuid := nullif(p_payload ->> 'payment_terms_id', '')::uuid;
  v_warehouse  uuid := nullif(p_payload ->> 'warehouse_id', '')::uuid;
  v_line       jsonb;
  v_line_no    integer := 0;
  v_qty        numeric;
  v_price      numeric;
  v_net        numeric;
  v_tax        numeric;
  v_rate       numeric;
  v_tax_id     uuid;
  v_status     sales.invoice_status;
begin
  perform app.require_permission(p_entity_id, 'sales.invoice.create');

  if v_customer is null or v_date is null then
    raise exception 'customer_id and invoice_date are required' using errcode = 'null_value_not_allowed';
  end if;

  if not exists (
    select 1 from app.customers c
     where c.id = v_customer and c.entity_id = p_entity_id
  ) then
    raise exception 'Customer was not found in this entity' using errcode = 'no_data_found';
  end if;

  if v_warehouse is not null and not exists (
    select 1 from inv.warehouses w
     where w.id = v_warehouse and w.entity_id = p_entity_id and w.is_active
  ) then
    raise exception 'Warehouse was not found in this entity' using errcode = 'no_data_found';
  end if;

  select coalesce(nullif(p_payload ->> 'currency_code', ''), c.currency_code)
    into v_currency
    from app.customers c
   where c.id = v_customer;

  if v_terms is not null then
    select (v_date + make_interval(days => t.days_net))::date into v_due
      from app.payment_terms t
     where t.id = v_terms and t.entity_id = p_entity_id;
  end if;
  v_due := coalesce((nullif(p_payload ->> 'due_date', ''))::date, v_due, v_date);

  if v_id is not null then
    select status into v_status from sales.invoices where id = v_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Invoice was not found' using errcode = 'no_data_found';
    end if;
    if v_status <> 'DRAFT' then
      raise exception 'Only a draft invoice can be saved' using errcode = 'restrict_violation';
    end if;

    update sales.invoices
       set customer_id = v_customer,
           invoice_date = v_date,
           due_date = v_due,
           currency_code = v_currency,
           payment_terms_id = v_terms,
           warehouse_id = v_warehouse,
           customer_po = nullif(p_payload ->> 'customer_po', ''),
           notes = nullif(p_payload ->> 'notes', ''),
           updated_by = app.acting_user_id()
     where id = v_id;

    delete from sales.invoice_lines where invoice_id = v_id;
  else
    insert into sales.invoices (
      entity_id, customer_id, invoice_date, due_date, currency_code,
      payment_terms_id, warehouse_id, customer_po, notes, created_by, updated_by
    ) values (
      p_entity_id, v_customer, v_date, v_due, v_currency,
      v_terms, v_warehouse, nullif(p_payload ->> 'customer_po', ''), nullif(p_payload ->> 'notes', ''),
      app.acting_user_id(), app.acting_user_id()
    )
    returning id into v_id;
  end if;

  if jsonb_typeof(p_payload -> 'lines') = 'array' then
    for v_line in select * from jsonb_array_elements(p_payload -> 'lines')
    loop
      v_line_no := v_line_no + 1;
      v_qty := (v_line ->> 'quantity')::numeric;
      v_price := (v_line ->> 'unit_price')::numeric;
      if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then
        raise exception 'Line %: quantity must be positive and unit_price must be zero or more', v_line_no
          using errcode = 'check_violation';
      end if;
      if length(btrim(coalesce(v_line ->> 'description', ''))) = 0 then
        raise exception 'Line %: description is required', v_line_no
          using errcode = 'null_value_not_allowed';
      end if;

      v_net := round(v_qty * v_price, 4);
      v_tax_id := nullif(v_line ->> 'tax_code_id', '')::uuid;
      v_rate := 0;
      if v_tax_id is not null then
        select t.rate into v_rate
          from app.tax_codes t
         where t.id = v_tax_id and t.entity_id = p_entity_id and t.is_active;
        if not found then
          raise exception 'Line %: tax code was not found', v_line_no using errcode = 'no_data_found';
        end if;
      end if;
      v_tax := round(v_net * coalesce(v_rate, 0), 4);

      insert into sales.invoice_lines (
        entity_id, invoice_id, line_no, item_id, description,
        quantity, unit_price, tax_code_id, tax_amount, line_net, revenue_account_id,
        stock_unit_id, stock_lot_id
      ) values (
        p_entity_id, v_id, v_line_no,
        nullif(v_line ->> 'item_id', '')::uuid,
        btrim(v_line ->> 'description'),
        v_qty, v_price, v_tax_id, v_tax, v_net,
        nullif(v_line ->> 'revenue_account_id', '')::uuid,
        nullif(v_line ->> 'stock_unit_id', '')::uuid,
        nullif(v_line ->> 'stock_lot_id', '')::uuid
      );
    end loop;
  end if;

  perform sales.recompute_invoice_totals(v_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_invoice: AR + stock ISSUE
-- ---------------------------------------------------------------------------

create or replace function sales.issue_invoice(
  p_invoice_id      uuid,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_inv          sales.invoices%rowtype;
  v_customer     app.customers%rowtype;
  v_ar           uuid;
  v_entry_id     uuid;
  v_invoice_no   text;
  v_lines        jsonb := '[]'::jsonb;
  v_line         record;
  v_tax          record;
  v_revenue      uuid;
  v_item         inv.items%rowtype;
  v_warehouse    uuid;
  v_needs_stock  boolean := false;
begin
  perform app.require_permission(
    (select entity_id from sales.invoices where id = p_invoice_id),
    'sales.invoice.issue'
  );

  select * into v_inv from sales.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % does not exist', p_invoice_id using errcode = 'no_data_found';
  end if;
  if v_inv.status = 'ISSUED' then
    return v_inv.journal_entry_id;
  end if;
  if v_inv.status <> 'DRAFT' then
    raise exception 'Only a draft invoice can be issued' using errcode = 'restrict_violation';
  end if;

  perform sales.recompute_invoice_totals(v_inv.id);
  select * into v_inv from sales.invoices where id = v_inv.id;

  if v_inv.total <= 0 then
    raise exception 'An invoice needs at least one line with a positive amount'
      using errcode = 'check_violation';
  end if;

  select * into v_customer from app.customers where id = v_inv.customer_id;
  if not v_customer.is_active then
    raise exception 'Customer % is inactive', v_customer.code using errcode = 'restrict_violation';
  end if;
  if v_customer.is_credit_hold then
    raise exception 'Customer % is on credit hold: %', v_customer.code, v_customer.credit_hold_reason
      using errcode = 'restrict_violation';
  end if;
  if v_customer.entity_id <> v_inv.entity_id then
    raise exception 'Customer does not belong to this entity' using errcode = 'restrict_violation';
  end if;

  select exists (
    select 1
      from sales.invoice_lines l
      join inv.items i on i.id = l.item_id
     where l.invoice_id = v_inv.id
       and i.is_stocked
  ) into v_needs_stock;

  v_warehouse := v_inv.warehouse_id;
  if v_needs_stock then
    if v_warehouse is null then
      select w.id into v_warehouse
        from inv.warehouses w
       where w.entity_id = v_inv.entity_id
         and w.is_active
         and not w.is_consignment
       order by w.code
       limit 1;
    end if;
    if v_warehouse is null then
      raise exception 'A warehouse is required to issue stocked invoice lines'
        using errcode = 'null_value_not_allowed';
    end if;
    if v_inv.warehouse_id is distinct from v_warehouse then
      update sales.invoices set warehouse_id = v_warehouse where id = v_inv.id;
      v_inv.warehouse_id := v_warehouse;
    end if;
  end if;

  v_ar := coalesce(
    v_customer.ar_account_id,
    (select a.id from gl.accounts a
      where a.entity_id = v_inv.entity_id
        and a.control_type = 'ACCOUNTS_RECEIVABLE'
        and a.is_postable
      order by a.code
      limit 1)
  );
  if v_ar is null then
    raise exception 'No receivables control account is configured' using errcode = 'no_data_found';
  end if;

  for v_line in
    select l.*, t.rate as tax_rate, t.output_tax_account_id
      from sales.invoice_lines l
      left join app.tax_codes t on t.id = l.tax_code_id
     where l.invoice_id = v_inv.id
     order by l.line_no
  loop
    v_revenue := coalesce(
      v_line.revenue_account_id,
      (select i.revenue_account_id from inv.items i where i.id = v_line.item_id),
      gl.setting_account(v_inv.entity_id, 'DEFAULT_REVENUE')
    );

    v_lines := v_lines || jsonb_build_object(
      'account_id',    v_revenue,
      'currency_code', v_inv.currency_code,
      'credit',        v_line.line_net,
      'debit',         0,
      'memo',          v_line.description,
      'customer_id',   v_inv.customer_id,
      'item_id',       v_line.item_id
    );
  end loop;

  for v_tax in
    select t.output_tax_account_id as account_id, sum(l.tax_amount) as amount
      from sales.invoice_lines l
      join app.tax_codes t on t.id = l.tax_code_id
     where l.invoice_id = v_inv.id
       and l.tax_amount > 0
     group by t.output_tax_account_id
  loop
    if v_tax.account_id is null then
      raise exception 'Tax code is missing an output tax account' using errcode = 'no_data_found';
    end if;
    v_lines := v_lines || jsonb_build_object(
      'account_id',    v_tax.account_id,
      'currency_code', v_inv.currency_code,
      'credit',        v_tax.amount,
      'debit',         0,
      'memo',          'Output tax',
      'customer_id',   v_inv.customer_id
    );
  end loop;

  v_lines := v_lines || jsonb_build_object(
    'account_id',    v_ar,
    'currency_code', v_inv.currency_code,
    'debit',         v_inv.total,
    'credit',        0,
    'memo',          'Accounts receivable',
    'customer_id',   v_inv.customer_id
  );

  v_invoice_no := app.next_document_number(v_inv.entity_id, 'INV', v_inv.invoice_date);

  -- Stock first so a failed issue rolls back before AR is posted.
  for v_line in
    select l.*
      from sales.invoice_lines l
     where l.invoice_id = v_inv.id
       and l.item_id is not null
     order by l.line_no
  loop
    select * into v_item from inv.items where id = v_line.item_id;
    if not found or not v_item.is_stocked then
      continue;
    end if;

    if v_item.tracking_mode = 'SERIAL' then
      if v_line.stock_unit_id is null then
        raise exception 'Line %: serialised item % requires a stock unit',
          v_line.line_no, v_item.part_number
          using errcode = 'null_value_not_allowed';
      end if;
      if v_line.quantity <> 1 then
        raise exception 'Line %: serialised items must be quantity 1', v_line.line_no
          using errcode = 'check_violation';
      end if;
      perform inv.assert_unit_releasable(v_line.stock_unit_id, v_inv.invoice_date);
    elsif v_item.tracking_mode = 'LOT' then
      if v_line.stock_lot_id is null then
        raise exception 'Line %: lot-tracked item % requires a stock lot',
          v_line.line_no, v_item.part_number
          using errcode = 'null_value_not_allowed';
      end if;
    end if;

    perform inv.post_movement(
      p_entity_id => v_inv.entity_id,
      p_item_id => v_line.item_id,
      p_warehouse_id => v_warehouse,
      p_movement_type => 'ISSUE',
      p_movement_date => v_inv.invoice_date,
      p_quantity => -v_line.quantity,
      p_stock_unit_id => v_line.stock_unit_id,
      p_stock_lot_id => v_line.stock_lot_id,
      p_source_type => 'SALES_INVOICE',
      p_source_id => v_inv.id,
      p_source_line_id => v_line.id,
      p_reference => v_invoice_no,
      p_notes => v_line.description,
      p_idempotency_key => case
        when p_idempotency_key is null then null
        else p_idempotency_key || ':stk:' || v_line.line_no::text
      end
    );
  end loop;

  v_entry_id := gl.post_entry(
    v_inv.entity_id,
    jsonb_build_object(
      'entry_date',         v_inv.invoice_date,
      'source_type',        'SALES_INVOICE',
      'source_id',          v_inv.id,
      'source_document_no', v_invoice_no,
      'description',        'Invoice ' || v_invoice_no || ' · ' || v_customer.legal_name,
      'lines',              v_lines
    ),
    p_idempotency_key
  );

  perform set_config('sales.allow_status_change', 'on', true);

  update sales.invoices
     set status = 'ISSUED',
         invoice_no = v_invoice_no,
         journal_entry_id = v_entry_id,
         warehouse_id = v_warehouse
   where id = v_inv.id;

  perform set_config('sales.allow_status_change', '', true);

  return v_entry_id;
end;
$$;

comment on function sales.issue_invoice(uuid, text) is
  'Issues a draft invoice: posts AR/revenue/tax, and for stocked lines posts inv.ISSUE (COGS) in the same transaction.';

-- ---------------------------------------------------------------------------
-- void_invoice: reverse AR + restock via CUSTOMER_RETURN
-- ---------------------------------------------------------------------------

create or replace function sales.void_invoice(
  p_invoice_id uuid,
  p_reason     text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_inv      sales.invoices%rowtype;
  v_entry_id uuid;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_mv       record;
begin
  perform app.require_permission(
    (select entity_id from sales.invoices where id = p_invoice_id),
    'sales.invoice.void'
  );

  if length(v_reason) < 10 then
    raise exception 'A void needs a reason of at least ten characters'
      using errcode = 'check_violation';
  end if;

  select * into v_inv from sales.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice % does not exist', p_invoice_id using errcode = 'no_data_found';
  end if;
  if v_inv.status <> 'ISSUED' then
    raise exception 'Only an issued invoice can be voided' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
      from sales.receipt_allocations a
      join sales.receipts r on r.id = a.receipt_id
     where a.invoice_id = v_inv.id
       and r.status = 'POSTED'
  ) then
    raise exception 'Invoice % has receipts applied. Reverse those first.'
      , v_inv.invoice_no
      using errcode = 'restrict_violation';
  end if;

  -- Restore stock before reversing AR so a stock failure leaves the invoice issued.
  for v_mv in
    select *
      from inv.stock_ledger
     where entity_id = v_inv.entity_id
       and source_type = 'SALES_INVOICE'
       and source_id = v_inv.id
       and movement_type = 'ISSUE'
     order by id
  loop
    perform inv.post_movement(
      p_entity_id => v_inv.entity_id,
      p_item_id => v_mv.item_id,
      p_warehouse_id => v_mv.warehouse_id,
      p_movement_type => 'CUSTOMER_RETURN',
      p_movement_date => v_inv.invoice_date,
      p_quantity => abs(v_mv.quantity),
      p_bin_id => coalesce(
        v_mv.bin_id,
        (select b.id from inv.bins b
          where b.warehouse_id = v_mv.warehouse_id and b.code = 'MAIN'
          limit 1)
      ),
      p_stock_unit_id => v_mv.stock_unit_id,
      p_stock_lot_id => v_mv.stock_lot_id,
      p_unit_cost_base => v_mv.unit_cost_base,
      p_source_type => 'SALES_INVOICE_VOID',
      p_source_id => v_inv.id,
      p_source_line_id => v_mv.source_line_id,
      p_reference => v_inv.invoice_no,
      p_notes => v_reason
    );
  end loop;

  v_entry_id := gl.reverse_entry(v_inv.journal_entry_id, v_reason, null, null);

  perform set_config('sales.allow_status_change', 'on', true);

  update sales.invoices
     set status = 'VOIDED',
         void_reason = v_reason,
         voided_at = now(),
         voided_by = app.acting_user_id()
   where id = v_inv.id;

  perform set_config('sales.allow_status_change', '', true);

  return v_entry_id;
end;
$$;

comment on function sales.void_invoice(uuid, text) is
  'Voids an issued invoice: restores stock via CUSTOMER_RETURN, then reverses the AR journal.';
