-- ===========================================================================
-- Goods receipt: lot-tracked items post through inv.stock_lots
-- ===========================================================================

do $$
declare
  v_suite     text := 'goods receipt lot';
  v_entity    uuid := test.entity();
  v_actor     uuid := app.system_user_id();
  v_supplier  uuid;
  v_wh        uuid := test.warehouse('MAIN');
  v_item      uuid;
  v_po        uuid;
  v_po_line   uuid;
  v_grn       uuid;
  v_lot       uuid;
  v_tax       uuid;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_tax from app.tax_codes where entity_id = v_entity and code = 'VAT16';

  v_supplier := app.save_supplier(v_entity, jsonb_build_object(
    'code', 'LOT-VND',
    'legal_name', 'Lot Receive Vendor',
    'currency_code', 'KES',
    'approval_status', 'APPROVED'
  ));

  insert into inv.items (
    entity_id, part_number, description, uom_code,
    tracking_mode, costing_method, requires_certificate, requires_serial_on_receipt,
    is_stocked, is_purchasable
  ) values (
    v_entity, 'LOT-PAD-1', 'Lot tracked brake pads', 'EA',
    'LOT', 'WEIGHTED_AVERAGE', false, false, true, true
  ) returning id into v_item;

  v_po := purch.save_po(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'order_date', test.open_date(),
    'warehouse_id', v_wh,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item,
        'description', 'Lot tracked brake pads',
        'quantity', 15,
        'unit_price', 4000,
        'tax_code_id', v_tax
      )
    )
  ));
  perform purch.approve_po(v_po);
  select id into v_po_line from purch.purchase_order_lines where po_id = v_po and line_no = 1;

  v_grn := purch.save_goods_receipt(v_entity, jsonb_build_object(
    'supplier_id', v_supplier,
    'po_id', v_po,
    'receipt_date', test.open_date(),
    'warehouse_id', v_wh,
    'lines', jsonb_build_array(
      jsonb_build_object(
        'po_line_id', v_po_line,
        'item_id', v_item,
        'description', 'Lot tracked brake pads',
        'quantity', 15,
        'unit_cost', 4000,
        'serial_number', 'LOT-2026-A',
        'condition_code', 'OH'
      )
    )
  ));

  perform purch.post_goods_receipt(v_grn);

  perform test.eq(v_suite, 'lot GRN is posted',
    (select status::text from purch.goods_receipts where id = v_grn), 'POSTED');

  select id into v_lot
    from inv.stock_lots
   where entity_id = v_entity and item_id = v_item and lot_number = 'LOT-2026-A';

  perform test.ok(v_suite, 'lot receive creates a stock lot', v_lot is not null);
  perform test.eq_num(v_suite, 'lot quantity on hand matches qty received',
    (select quantity_on_hand from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_wh), 15);
  perform test.ok(v_suite, 'lot movement stores the stock lot',
    exists (
      select 1 from inv.stock_ledger
       where source_type = 'GOODS_RECEIPT' and source_id = v_grn and stock_lot_id = v_lot
    ));
end;
$$;
