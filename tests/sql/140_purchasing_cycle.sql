-- ===========================================================================
-- Purchasing cycle: PO → GRN → bill → payment
-- ===========================================================================

do $$
declare
  v_suite      text := 'purchasing cycle';
  v_entity     uuid := test.entity();
  v_actor      uuid := app.system_user_id();
  v_supplier   uuid;
  v_wh         uuid := test.warehouse('MAIN');
  v_bin        uuid;
  v_item       uuid;
  v_po         uuid;
  v_po_line    uuid;
  v_grn        uuid;
  v_grn_line   uuid;
  v_bill       uuid;
  v_payment    uuid;
  v_entry      uuid;
  v_bank       uuid := test.account('1015');
  v_tax        uuid;
  v_inv        numeric;
  v_grni       numeric;
  v_ap         numeric;
  v_vat        numeric;
  v_outstanding numeric;
  v_unit       uuid;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_bin from inv.bins where warehouse_id = v_wh and code = 'MAIN';
  select id into v_tax from app.tax_codes where entity_id = v_entity and code = 'VAT16';

  v_supplier := app.save_supplier(v_entity, jsonb_build_object(
    'code', 'HONEYWELL',
    'legal_name', 'Honeywell International Inc.',
    'currency_code', 'KES',
    'approval_status', 'APPROVED'
  ));
  perform test.ok(v_suite, 'an approved supplier can be saved', v_supplier is not null);

  insert into inv.items (
    entity_id, part_number, description, uom_code,
    tracking_mode, costing_method, requires_certificate, requires_serial_on_receipt,
    is_stocked, is_purchasable
  ) values (
    v_entity, 'PO-ACT-1', 'Purchasing test actuator', 'EA',
    'SERIAL', 'SPECIFIC', false, false, true, true
  ) returning id into v_item;

  -- -------------------------------------------------------------------------
  -- PO: draft → approve (no GL)
  -- -------------------------------------------------------------------------

  v_po := purch.save_po(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'order_date', test.open_date(),
    'warehouse_id', v_wh,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item,
        'description', 'Purchasing test actuator',
        'quantity', 1,
        'unit_price', 10000,
        'tax_code_id', v_tax
      )
    )
  ));

  perform test.eq_num(v_suite, 'PO subtotal is quantity times price',
    (select subtotal from purch.purchase_orders where id = v_po), 10000);
  perform test.eq_num(v_suite, 'PO VAT 16 percent is computed on the net',
    (select tax_total from purch.purchase_orders where id = v_po), 1600);

  perform test.throws(v_suite, 'a draft PO cannot be approved by updating status',
    format('update purch.purchase_orders set status = %L where id = %L', 'APPROVED', v_po),
    'purch.approve_po');

  perform purch.approve_po(v_po);

  perform test.ok(v_suite, 'approving allocates a PO number',
    (select po_no from purch.purchase_orders where id = v_po) is not null);
  perform test.eq(v_suite, 'the PO is approved',
    (select status::text from purch.purchase_orders where id = v_po), 'APPROVED');
  perform test.ok(v_suite, 'approving a PO does not write a journal',
    not exists (
      select 1 from gl.journal_entry
       where source_type = 'PURCHASE_BILL' and source_id = v_po
    ));

  perform test.throws(v_suite, 'an approved PO cannot be edited',
    format('update purch.purchase_orders set notes = %L where id = %L', 'tamper', v_po),
    'cannot be amended');

  select id into v_po_line from purch.purchase_order_lines where po_id = v_po and line_no = 1;

  -- -------------------------------------------------------------------------
  -- GRN: receive serial → inventory / GRNI
  -- -------------------------------------------------------------------------

  v_grn := purch.save_goods_receipt(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'po_id', v_po,
    'receipt_date', test.open_date(),
    'warehouse_id', v_wh,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'po_line_id', v_po_line,
        'item_id', v_item,
        'description', 'Purchasing test actuator',
        'quantity', 1,
        'unit_cost', 10000,
        'bin_id', v_bin,
        'serial_number', 'SN-PO-1',
        'condition_code', 'OH'
      )
    )
  ));

  perform purch.post_goods_receipt(v_grn);

  perform test.eq(v_suite, 'the GRN is posted',
    (select status::text from purch.goods_receipts where id = v_grn), 'POSTED');
  perform test.ok(v_suite, 'posting allocates a GRN number',
    (select grn_no from purch.goods_receipts where id = v_grn) is not null);

  select stock_unit_id into v_unit
    from purch.goods_receipt_lines
   where goods_receipt_id = v_grn and line_no = 1;

  perform test.ok(v_suite, 'serial receive creates a stock unit', v_unit is not null);
  perform test.eq(v_suite, 'stock unit is on hand',
    (select status::text from inv.stock_units where id = v_unit), 'ON_HAND');
  perform test.eq_num(v_suite, 'quantity on hand is one after receipt',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_wh), 1);

  select
    coalesce(sum(case when account_id = test.account('1210') then debit_base - credit_base end), 0),
    coalesce(sum(case when account_id = test.account('2020') then credit_base - debit_base end), 0)
    into v_inv, v_grni
    from gl.journal_entry_line
   where entry_id in (
     select journal_entry_id from inv.stock_ledger
      where source_type = 'GOODS_RECEIPT' and source_id = v_grn
   );

  perform test.eq_num(v_suite, 'receipt debited inventory at unit cost', v_inv, 10000);
  perform test.eq_num(v_suite, 'receipt credited GRNI at unit cost', v_grni, 10000);

  select id into v_grn_line from purch.goods_receipt_lines where goods_receipt_id = v_grn and line_no = 1;

  -- -------------------------------------------------------------------------
  -- Bill: match GRN → clear GRNI, book VAT, credit AP
  -- -------------------------------------------------------------------------

  v_bill := purch.save_bill(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'bill_date', test.open_date(),
    'receipt_matches', jsonb_build_array(
      jsonb_build_object('goods_receipt_id', v_grn)
    ),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item,
        'description', 'Purchasing test actuator',
        'quantity', 1,
        'unit_price', 10000,
        'tax_code_id', v_tax,
        'goods_receipt_line_id', v_grn_line
      )
    )
  ));

  perform test.eq_num(v_suite, 'bill total is net plus tax',
    (select total from purch.bills where id = v_bill), 11600);

  perform test.throws(v_suite, 'a draft bill cannot be posted by updating status',
    format('update purch.bills set status = %L where id = %L', 'POSTED', v_bill),
    'purch.post_bill');

  v_entry := purch.post_bill(v_bill);

  perform test.eq(v_suite, 'the bill is posted',
    (select status::text from purch.bills where id = v_bill), 'POSTED');

  select
    coalesce(sum(case when account_id = test.account('2020') then debit_base - credit_base end), 0),
    coalesce(sum(case when account_id = test.account('1410') then debit_base - credit_base end), 0),
    coalesce(sum(case when account_id = test.account('2010') then credit_base - debit_base end), 0)
    into v_grni, v_vat, v_ap
    from gl.journal_entry_line
   where entry_id = v_entry;

  perform test.eq_num(v_suite, 'matched bill debited GRNI for the net', v_grni, 10000);
  perform test.eq_num(v_suite, 'matched bill debited VAT input', v_vat, 1600);
  perform test.eq_num(v_suite, 'matched bill credited AP for the gross', v_ap, 11600);

  -- -------------------------------------------------------------------------
  -- Payment: clear the bill
  -- -------------------------------------------------------------------------

  v_payment := purch.save_payment(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'payment_date', test.open_date(),
    'amount', 11600,
    'bank_account_id', v_bank,
    'allocations', jsonb_build_array(
      jsonb_build_object('bill_id', v_bill, 'amount', 11600)
    )
  ));

  perform purch.post_payment(v_payment);

  select outstanding into v_outstanding from purch.v_bill_balances where id = v_bill;
  perform test.eq_num(v_suite, 'a full payment clears the bill', v_outstanding, 0);

  perform purch.reverse_payment(v_payment, 'Paid from the wrong bank account');

  select outstanding into v_outstanding from purch.v_bill_balances where id = v_bill;
  perform test.eq_num(v_suite, 'reversing the payment reopens the bill', v_outstanding, 11600);

  -- -------------------------------------------------------------------------
  -- Expense bill without GRN matching
  -- -------------------------------------------------------------------------
  declare
    v_exp_bill uuid;
    v_exp_entry uuid;
    v_exp numeric;
  begin
    v_exp_bill := purch.save_bill(v_entity, jsonb_build_object(
      'supplier_id', v_supplier,
      'bill_date', test.open_date(),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'description', 'Freight on purchase',
          'quantity', 1,
          'unit_price', 500,
          'tax_code_id', v_tax,
          'expense_account_id', test.account('5020')
        )
      )
    ));

    v_exp_entry := purch.post_bill(v_exp_bill);

    select
      coalesce(sum(case when account_id = test.account('5020') then debit_base - credit_base end), 0),
      coalesce(sum(case when account_id = test.account('2010') then credit_base - debit_base end), 0)
      into v_exp, v_ap
      from gl.journal_entry_line
     where entry_id = v_exp_entry;

    perform test.eq_num(v_suite, 'unmatched bill debited expense', v_exp, 500);
    perform test.eq_num(v_suite, 'unmatched bill credited AP for gross', v_ap, 580);
  end;

  -- -------------------------------------------------------------------------
  -- Draft cancel
  -- -------------------------------------------------------------------------
  declare
    v_draft uuid;
  begin
    v_draft := purch.save_po(v_entity, jsonb_build_object(
      'supplier_id', v_supplier,
      'order_date', test.open_date(),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'description', 'Will cancel',
          'quantity', 1,
          'unit_price', 1
        )
      )
    ));
    perform purch.cancel_po(v_draft, 'Ordered in error');
    perform test.eq(v_suite, 'a draft PO can be cancelled',
      (select status::text from purch.purchase_orders where id = v_draft), 'CANCELLED');
  end;
end;
$$;
