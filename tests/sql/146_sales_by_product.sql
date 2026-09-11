-- ===========================================================================
-- Sales by Product/Service Summary — accrual vs cash, quantity, amount, COS
-- ===========================================================================

do $$
declare
  v_suite     text := 'sales by product';
  v_entity    uuid := test.entity();
  v_actor     uuid := app.system_user_id();
  v_date      date := test.open_date();
  v_wh        uuid := test.warehouse('MAIN');
  v_bin       uuid;
  v_bank      uuid := test.account('1015');
  v_customer  uuid;
  v_category  uuid;
  v_item      uuid;
  v_pads_inv  uuid;
  v_hours_inv uuid;
  v_draft_inv uuid;
  v_receipt   uuid;
  v_sale      uuid;
  v_qty       numeric;
  v_amount    numeric;
  v_cos       numeric;
  v_cash_n    numeric;
begin
  perform set_config('app.current_user_id', v_actor::text, true);
  select id into v_bin from inv.bins where warehouse_id = v_wh and code = 'MAIN';

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'SBP-CUST',
    'legal_name', 'Sales by Product Airways',
    'currency_code', 'KES'
  ));

  v_category := inv.save_item_category(v_entity, jsonb_build_object(
    'code', 'SBP-HW',
    'name', 'Hardware'
  ));

  v_item := inv.save_item(v_entity, jsonb_build_object(
    'part_number', 'SBP-BP-1',
    'description', 'Brake Pads',
    'item_type', 'INVENTORY',
    'category_id', v_category,
    'uom_code', 'EA',
    'tracking_mode', 'NONE'
  ));

  perform inv.post_movement(
    p_entity_id => v_entity,
    p_item_id => v_item,
    p_warehouse_id => v_wh,
    p_movement_type => 'RECEIPT',
    p_movement_date => v_date,
    p_quantity => 1,
    p_bin_id => v_bin,
    p_unit_cost_base => 4000
  );

  v_pads_inv := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', v_date,
    'warehouse_id', v_wh,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item,
        'description', 'Brake Pads',
        'quantity', 1,
        'unit_price', 5000
      )
    )
  ));
  perform sales.issue_invoice(v_pads_inv);

  v_hours_inv := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', v_date,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Hours',
        'quantity', 1,
        'unit_price', 5
      )
    )
  ));
  perform sales.issue_invoice(v_hours_inv);

  v_draft_inv := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', v_date,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Draft labour that must not appear',
        'quantity', 1,
        'unit_price', 999
      )
    )
  ));
  perform test.eq(v_suite, 'draft invoice stays draft',
    (select status::text from sales.invoices where id = v_draft_inv), 'DRAFT');

  select quantity, amount, cos into v_qty, v_amount, v_cos
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'ACCRUAL')
   where product_name = 'Brake Pads';

  perform test.eq_num(v_suite, 'accrual quantity is the issued invoice quantity', v_qty, 1);
  perform test.eq_num(v_suite, 'accrual amount is line net, not tax-inclusive', v_amount, 5000);
  perform test.eq_num(v_suite, 'accrual COS is the stock issue cost', v_cos, 4000);

  select quantity, amount, cos into v_qty, v_amount, v_cos
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'ACCRUAL')
   where product_name = 'Hours';

  perform test.eq_num(v_suite, 'uncategorised labour appears with its invoice amount', v_amount, 5);
  perform test.eq_num(v_suite, 'labour without stock has zero COS', v_cos, 0);

  perform test.ok(v_suite, 'draft invoices are excluded',
    not exists (
      select 1 from sales.sales_by_product_summary(v_entity, v_date, v_date, 'ACCRUAL')
       where product_name like 'Draft labour%'
    ));

  perform test.eq(v_suite, 'Brake Pads sit under Hardware',
    (select category_name from sales.sales_by_product_summary(v_entity, v_date, v_date, 'ACCRUAL')
      where product_name = 'Brake Pads'), 'Hardware');

  select count(*)::numeric into v_cash_n
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'CASH');
  perform test.eq_num(v_suite, 'unpaid invoices do not appear on cash basis', v_cash_n, 0);

  v_receipt := sales.save_receipt(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'receipt_date', v_date,
    'amount', 2500,
    'bank_account_id', v_bank,
    'allocations', jsonb_build_array(
      jsonb_build_object('invoice_id', v_pads_inv, 'amount', 2500)
    )
  ));
  perform sales.post_receipt(v_receipt);

  select quantity, amount, cos into v_qty, v_amount, v_cos
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'CASH')
   where product_name = 'Brake Pads';

  perform test.eq_num(v_suite, 'cash attributes quantity in proportion to the receipt', v_qty, 0.5);
  perform test.eq_num(v_suite, 'cash attributes amount in proportion to the receipt', v_amount, 2500);
  perform test.eq_num(v_suite, 'cash attributes COS in proportion to the receipt', v_cos, 2000);

  perform test.ok(v_suite, 'unpaid Hours stay off cash basis after a pads receipt',
    not exists (
      select 1 from sales.sales_by_product_summary(v_entity, v_date, v_date, 'CASH')
       where product_name = 'Hours'
    ));

  v_sale := sales.save_sales_receipt(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'receipt_date', v_date,
    'bank_account_id', v_bank,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Counter sale',
        'quantity', 1,
        'unit_price', 100
      )
    )
  ));
  perform sales.post_sales_receipt(v_sale);

  select amount into v_amount
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'ACCRUAL')
   where product_name = 'Counter sale';
  perform test.eq_num(v_suite, 'posted sales receipts appear on accrual', v_amount, 100);

  select amount into v_amount
    from sales.sales_by_product_summary(v_entity, v_date, v_date, 'CASH')
   where product_name = 'Counter sale';
  perform test.eq_num(v_suite, 'posted sales receipts appear on cash', v_amount, 100);
end;
$$;
