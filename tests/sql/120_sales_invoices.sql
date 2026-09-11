-- ===========================================================================
-- Sales invoices and customer receipts
-- ===========================================================================

do $$
declare
  v_suite    text := 'sales invoices';
  v_entity   uuid := test.entity();
  v_actor    uuid := app.system_user_id();
  v_customer uuid;
  v_invoice  uuid;
  v_receipt  uuid;
  v_entry    uuid;
  v_bank     uuid := test.account('1015');
  v_ar       numeric;
  v_rev      numeric;
  v_vat      numeric;
  v_outstanding numeric;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'KQA',
    'legal_name', 'Kenya Airways PLC',
    'currency_code', 'KES'
  ));

  perform test.ok(v_suite, 'a customer can be saved', v_customer is not null);

  v_invoice := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', test.open_date(),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Actuator overhaul — labour',
        'quantity', 1,
        'unit_price', 10000,
        'tax_code_id', (select id from app.tax_codes where entity_id = v_entity and code = 'VAT16')
      )
    )
  ));

  perform test.eq_num(v_suite, 'line net is quantity times price',
    (select subtotal from sales.invoices where id = v_invoice), 10000);
  perform test.eq_num(v_suite, 'VAT 16 percent is computed on the net',
    (select tax_total from sales.invoices where id = v_invoice), 1600);
  perform test.eq_num(v_suite, 'the invoice total is net plus tax',
    (select total from sales.invoices where id = v_invoice), 11600);

  perform test.throws(v_suite, 'a draft cannot be posted to the ledger by updating status',
    format('update sales.invoices set status = %L where id = %L', 'ISSUED', v_invoice),
    'sales.issue_invoice');

  v_entry := sales.issue_invoice(v_invoice);

  perform test.ok(v_suite, 'issuing allocates a customer-facing number',
    (select invoice_no from sales.invoices where id = v_invoice) is not null);
  perform test.eq(v_suite, 'the invoice is issued',
    (select status::text from sales.invoices where id = v_invoice), 'ISSUED');

  select
    coalesce(sum(case when account_id = test.account('1110') then debit_base - credit_base end), 0),
    coalesce(sum(case when account_id = test.account('4010') then credit_base - debit_base end), 0),
    coalesce(sum(case when account_id = test.account('2110') then credit_base - debit_base end), 0)
    into v_ar, v_rev, v_vat
    from gl.journal_entry_line
   where entry_id = v_entry;

  perform test.eq_num(v_suite, 'receivables were debited for the gross', v_ar, 11600);
  perform test.eq_num(v_suite, 'revenue was credited for the net', v_rev, 10000);
  perform test.eq_num(v_suite, 'output tax was credited', v_vat, 1600);

  perform test.throws(v_suite, 'an issued invoice cannot be edited',
    format('update sales.invoices set notes = %L where id = %L', 'tamper', v_invoice),
    'cannot be amended');

  v_receipt := sales.save_receipt(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'receipt_date', test.open_date(),
    'amount', 11600,
    'bank_account_id', v_bank,
    'allocations', jsonb_build_array(
      jsonb_build_object('invoice_id', v_invoice, 'amount', 11600)
    )
  ));

  perform sales.post_receipt(v_receipt);

  select outstanding into v_outstanding from sales.v_invoice_balances where id = v_invoice;
  perform test.eq_num(v_suite, 'a full receipt clears the invoice', v_outstanding, 0);

  perform test.throws(v_suite, 'a receipted invoice cannot be voided',
    format('select sales.void_invoice(%L, %L)', v_invoice, 'trying to void a paid invoice'),
    'receipts applied');

  perform sales.reverse_receipt(v_receipt, 'Customer paid into the wrong account');

  select outstanding into v_outstanding from sales.v_invoice_balances where id = v_invoice;
  perform test.eq_num(v_suite, 'reversing the receipt reopens the invoice', v_outstanding, 11600);

  perform sales.void_invoice(v_invoice, 'Raised against the wrong customer');

  perform test.eq(v_suite, 'the invoice is voided',
    (select status::text from sales.invoices where id = v_invoice), 'VOIDED');
  perform test.ok(v_suite, 'voiding reversed the original journal',
    exists (
      select 1 from gl.journal_entry
       where reversal_of_entry_id = v_entry
    ));

  -- -------------------------------------------------------------------------
  -- Stocked serial invoice posts COGS and restores stock on void
  -- -------------------------------------------------------------------------
  declare
    v_wh uuid := test.warehouse('MAIN');
    v_bin uuid;
    v_item uuid;
    v_unit uuid;
    v_stock_inv uuid;
    v_cogs numeric;
  begin
    select id into v_bin from inv.bins where warehouse_id = v_wh and code = 'MAIN';

    insert into inv.items (
      entity_id, part_number, description, uom_code,
      tracking_mode, costing_method, requires_certificate, requires_serial_on_receipt,
      is_stocked, is_sellable
    ) values (
      v_entity, 'INV-ACT-9', 'Invoice test actuator', 'EA',
      'SERIAL', 'SPECIFIC', false, false, true, true
    ) returning id into v_item;

    insert into inv.stock_units (
      entity_id, item_id, serial_number, condition_code, status, warehouse_id, bin_id
    ) values (v_entity, v_item, 'SN-INV-1', 'OH', 'ON_HAND', v_wh, v_bin)
    returning id into v_unit;

    perform inv.post_movement(
      p_entity_id => v_entity, p_item_id => v_item, p_warehouse_id => v_wh,
      p_movement_type => 'RECEIPT', p_movement_date => test.open_date(), p_quantity => 1,
      p_bin_id => v_bin, p_stock_unit_id => v_unit, p_unit_cost_base => 5000
    );

    v_stock_inv := sales.save_invoice(v_entity, jsonb_build_object(
      'customer_id', v_customer,
      'invoice_date', test.open_date(),
      'warehouse_id', v_wh,
      'lines', jsonb_build_array(
        jsonb_build_object(
          'item_id', v_item,
          'description', 'Invoice test actuator',
          'quantity', 1,
          'unit_price', 8000,
          'stock_unit_id', v_unit,
          'tax_code_id', (select id from app.tax_codes where entity_id = v_entity and code = 'VAT16')
        )
      )
    ));

    perform sales.issue_invoice(v_stock_inv);

    perform test.eq(v_suite, 'stocked unit is delivered after invoice issue',
      (select status::text from inv.stock_units where id = v_unit), 'DELIVERED');

    select coalesce(sum(debit_base - credit_base), 0) into v_cogs
      from gl.journal_entry_line
     where entity_id = v_entity
       and account_id = test.account('5010')
       and entry_id in (
         select journal_entry_id from inv.stock_ledger
          where source_type = 'SALES_INVOICE' and source_id = v_stock_inv
       );

    perform test.eq_num(v_suite, 'issuing a stocked invoice posts COGS at unit cost', v_cogs, 5000);

    perform sales.void_invoice(v_stock_inv, 'Wrong serial sold on the invoice');

    perform test.eq(v_suite, 'voiding restores the unit to on hand',
      (select status::text from inv.stock_units where id = v_unit), 'ON_HAND');
    perform test.eq_num(v_suite, 'voiding restores quantity on hand',
      (select quantity_on_hand from inv.stock_balances
        where entity_id = v_entity and item_id = v_item and warehouse_id = v_wh), 1);
  end;
end;
$$;
