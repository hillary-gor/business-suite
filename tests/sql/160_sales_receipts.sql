-- ===========================================================================
-- Sales receipts (cash sales) + document layout preferences
-- ===========================================================================

do $$
declare
  v_suite      text := 'sales receipts';
  v_entity     uuid := test.entity();
  v_actor      uuid := app.system_user_id();
  v_customer   uuid;
  v_bank       uuid;
  v_tax        uuid;
  v_receipt    uuid;
  v_entry      uuid;
  v_layout     jsonb;
  v_cash       numeric;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_tax from app.tax_codes where entity_id = v_entity and code = 'VAT16';
  select id into v_bank
    from gl.accounts
   where entity_id = v_entity and control_type = 'BANK' and is_postable
   limit 1;
  if v_bank is null then
    select id into v_bank
      from gl.accounts
     where entity_id = v_entity and control_type = 'CASH' and is_postable
     limit 1;
  end if;

  perform test.ok(v_suite, 'seed has a cash/bank account', v_bank is not null);

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'SR-CUST',
    'legal_name', 'Cash Buyer Ltd',
    'currency_code', 'KES'
  ));

  -- Layout defaults / save
  v_layout := app.get_document_layout(v_entity, 'SALES_RECEIPT');
  perform test.ok(v_suite, 'default layout shows logo', (v_layout ->> 'show_logo')::boolean);
  perform test.eq(v_suite, 'default qty label',
    v_layout #>> '{columns,qty,label}', 'Qty');

  perform app.save_document_layout(v_entity, 'SALES_RECEIPT', jsonb_build_object(
    'show_ship_to', false,
    'columns', (app.default_document_layout('SALES_RECEIPT') -> 'columns') ||
      jsonb_build_object('qty', jsonb_build_object('visible', true, 'label', 'Quantity'))
  ));
  v_layout := app.get_document_layout(v_entity, 'SALES_RECEIPT');
  perform test.ok(v_suite, 'saved layout hides ship to', not (v_layout ->> 'show_ship_to')::boolean);
  perform test.eq(v_suite, 'saved qty label overrides default',
    v_layout #>> '{columns,qty,label}', 'Quantity');

  -- Draft then post
  v_receipt := sales.save_sales_receipt(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'receipt_date', test.open_date(),
    'bank_account_id', v_bank,
    'bill_email', 'buyer@example.com',
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Walk-in parts sale',
        'quantity', 2,
        'unit_price', 1000,
        'tax_code_id', v_tax
      )
    )
  ));

  perform test.eq(v_suite, 'sales receipt starts draft',
    (select status::text from sales.sales_receipts where id = v_receipt), 'DRAFT');
  perform test.eq_num(v_suite, 'sales receipt total includes VAT',
    (select total from sales.sales_receipts where id = v_receipt), 2320);

  v_entry := sales.post_sales_receipt(v_receipt);

  perform test.ok(v_suite, 'posting returns a journal', v_entry is not null);
  perform test.eq(v_suite, 'sales receipt is posted',
    (select status::text from sales.sales_receipts where id = v_receipt), 'POSTED');
  perform test.ok(v_suite, 'posting allocates a receipt number',
    (select receipt_no from sales.sales_receipts where id = v_receipt) is not null);

  select coalesce(sum(jl.debit_base - jl.credit_base), 0)
    into v_cash
    from gl.journal_entry_line jl
   where jl.entry_id = v_entry and jl.account_id = v_bank;
  perform test.eq_num(v_suite, 'bank is debited for the total', v_cash, 2320);

  perform test.throws(v_suite, 'posted sales receipt cannot be amended',
    format('update sales.sales_receipts set notes = %L where id = %L', 'x', v_receipt),
    'posted sales receipt');
end;
$$;
