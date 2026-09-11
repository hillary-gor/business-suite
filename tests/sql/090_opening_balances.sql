-- ===========================================================================
-- The QuickBooks cutover.
--
-- This happens once. If it is wrong, every reconciliation for years afterwards
-- is wrong by the same amount and nobody will know why. So the validation is
-- tested harder than the posting: each of the eight checks is made to fail
-- deliberately, and then the batch is proved unpostable while it does.
-- ===========================================================================

do $$
declare
  v_suite    text := 'opening balances';
  v_entity   uuid := test.entity();
  v_cutover  date := test.open_date();
  v_batch    uuid;
  v_customer uuid;
  v_supplier uuid;
  v_item     uuid;
  v_wh       uuid := test.warehouse('MAIN');
  v_entry    uuid;
  v_tie      record;
  v_failing  int;
begin
  -- Trading partners and a part, as they would have been migrated first.
  insert into app.customers (entity_id, code, legal_name, currency_code)
  values (v_entity, 'KQ001', 'Kenya Airways PLC', 'KES')
  returning id into v_customer;

  insert into app.suppliers (entity_id, code, legal_name, currency_code, approval_status)
  values (v_entity, 'AVS001', 'Aviall Services Inc', 'USD', 'APPROVED')
  returning id into v_supplier;

  insert into inv.items (
    entity_id, part_number, description, uom_code, tracking_mode, costing_method,
    requires_certificate, requires_serial_on_receipt
  )
  values (v_entity, 'BRK-PAD-737', 'Brake pad assembly', 'EA', 'NONE', 'WEIGHTED_AVERAGE', false, false)
  returning id into v_item;

  insert into gl.ob_batch (entity_id, cutover_date, source_system)
  values (v_entity, v_cutover, 'QuickBooks Desktop')
  returning id into v_batch;

  -- A balanced trial balance: cash and receivables and stock on one side,
  -- payables and equity on the other.
  insert into gl.ob_trial_balance_line (batch_id, line_no, account_code, debit, credit, memo) values
    (v_batch, 1, '1015',  2500000, 0,       'Bank balance per statement'),
    (v_batch, 2, '1110',  1800000, 0,       'Trade receivables'),
    (v_batch, 3, '1210',   750000, 0,       'Stock on hand'),
    (v_batch, 4, '2010',        0, 1200000, 'Trade payables'),
    (v_batch, 5, '3020',        0, 3850000, 'Retained earnings');

  insert into gl.ob_ar_open_item
    (batch_id, customer_code, document_no, document_date, due_date, currency_code, amount_txn, amount_base)
  values
    (v_batch, 'KQ001', 'INV-8801', v_cutover - 45, v_cutover - 15, 'KES', 1100000, 1100000),
    (v_batch, 'KQ001', 'INV-8842', v_cutover - 20, v_cutover + 10, 'KES',  700000,  700000);

  insert into gl.ob_ap_open_item
    (batch_id, supplier_code, document_no, document_date, due_date, currency_code, amount_txn, amount_base)
  values
    (v_batch, 'AVS001', 'AV-55021', v_cutover - 30, v_cutover + 15, 'KES', 1200000, 1200000);

  insert into gl.ob_inventory_line
    (batch_id, part_number, warehouse_code, bin_code, condition_code, quantity, unit_cost_base)
  values
    (v_batch, 'BRK-PAD-737', 'MAIN', 'MAIN', 'NE', 150, 5000);

  -- -------------------------------------------------------------------------
  -- Every check passes on well-formed data
  -- -------------------------------------------------------------------------

  select count(*) into v_failing
    from gl.validate_opening_balances(v_batch) where not passed;

  perform test.eq_num(v_suite, 'a well-formed cutover passes every check', v_failing, 0);

  -- -------------------------------------------------------------------------
  -- Each check earns its place by being made to fail
  -- -------------------------------------------------------------------------

  -- 1. Trial balance out of balance.
  update gl.ob_trial_balance_line set debit = 2500001 where batch_id = v_batch and line_no = 1;
  perform test.ok(v_suite, 'an unbalanced trial balance is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'Trial balance nets to zero'));
  perform test.throws(v_suite,
    'an unbalanced cutover cannot be posted',
    format('select gl.post_opening_balances(%L)', v_batch),
    'cannot be posted');
  update gl.ob_trial_balance_line set debit = 2500000 where batch_id = v_batch and line_no = 1;

  -- 2. An account that does not exist.
  update gl.ob_trial_balance_line set account_code = '9999' where batch_id = v_batch and line_no = 2;
  perform test.ok(v_suite, 'an unknown account code is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'All accounts exist and are postable'));
  update gl.ob_trial_balance_line set account_code = '1110' where batch_id = v_batch and line_no = 2;

  -- 3. Receivables detail that disagrees with the control total. This is the
  --    single most common cutover error.
  update gl.ob_ar_open_item set amount_base = 690000, amount_txn = 690000
   where batch_id = v_batch and document_no = 'INV-8842';
  perform test.ok(v_suite, 'receivables detail short of the control account is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'Receivables detail agrees with control account'));
  perform test.eq_num(v_suite, 'and the difference is reported precisely',
    (select difference from gl.validate_opening_balances(v_batch)
      where check_name = 'Receivables detail agrees with control account'),
    -10000);
  update gl.ob_ar_open_item set amount_base = 700000, amount_txn = 700000
   where batch_id = v_batch and document_no = 'INV-8842';

  -- 4. Payables detail that disagrees.
  update gl.ob_ap_open_item set amount_base = 1150000, amount_txn = 1150000
   where batch_id = v_batch;
  perform test.ok(v_suite, 'payables detail disagreeing with the control account is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'Payables detail agrees with control account'));
  update gl.ob_ap_open_item set amount_base = 1200000, amount_txn = 1200000
   where batch_id = v_batch;

  -- 5. Stock valuation that disagrees.
  update gl.ob_inventory_line set unit_cost_base = 4900 where batch_id = v_batch;
  perform test.ok(v_suite, 'stock valued differently from the control account is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'Inventory valuation agrees with control account'));
  update gl.ob_inventory_line set unit_cost_base = 5000 where batch_id = v_batch;

  -- 6. A customer who was never migrated.
  update gl.ob_ar_open_item set customer_code = 'GHOST' where batch_id = v_batch and document_no = 'INV-8801';
  perform test.ok(v_suite, 'a reference to a customer that does not exist is caught',
    not (select passed from gl.validate_opening_balances(v_batch)
          where check_name = 'All referenced master records exist'));
  update gl.ob_ar_open_item set customer_code = 'KQ001' where batch_id = v_batch and document_no = 'INV-8801';

  -- 7. A serialised part imported without its serial number.
  declare
    v_serial_item uuid;
  begin
    insert into inv.items (entity_id, part_number, description, uom_code, tracking_mode, costing_method)
    values (v_entity, 'APU-GTCP-131', 'Auxiliary power unit', 'EA', 'SERIAL', 'SPECIFIC')
    returning id into v_serial_item;

    insert into gl.ob_inventory_line
      (batch_id, part_number, warehouse_code, bin_code, condition_code, quantity, unit_cost_base)
    values (v_batch, 'APU-GTCP-131', 'MAIN', 'MAIN', 'OH', 1, 0);

    perform test.ok(v_suite, 'a serialised part with no serial number is caught',
      not (select passed from gl.validate_opening_balances(v_batch)
            where check_name = 'Serialised stock lines carry a unique serial number'));

    delete from gl.ob_inventory_line where batch_id = v_batch and part_number = 'APU-GTCP-131';
  end;

  select count(*) into v_failing from gl.validate_opening_balances(v_batch) where not passed;
  perform test.eq_num(v_suite, 'the batch is clean again after every correction', v_failing, 0);

  -- -------------------------------------------------------------------------
  -- Posting
  -- -------------------------------------------------------------------------

  v_entry := gl.post_opening_balances(v_batch);

  perform test.ok(v_suite, 'the cutover posted a journal entry', v_entry is not null);

  perform test.eq(v_suite, 'the batch is marked posted',
    (select status from gl.ob_batch where id = v_batch), 'POSTED'::gl.ob_status);

  perform test.eq_num(v_suite, 'the cutover posted as a single journal entry',
    (select count(*) from gl.journal_entry
      where entity_id = v_entity and source_type = 'OPENING_BALANCE'),
    1);

  perform test.eq_num(v_suite, 'and it balances',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entry_id = v_entry),
    0);

  perform test.eq(v_suite, 'it is dated the cutover date',
    (select entry_date from gl.journal_entry where id = v_entry), v_cutover);

  -- Receivables came across as detail, not a lump, so ageing works from day one.
  perform test.eq_num(v_suite, 'receivables came across one invoice per line',
    (select count(*) from gl.journal_entry_line
      where entry_id = v_entry and account_id = test.account('1110')),
    2);

  perform test.eq_num(v_suite, 'every receivables line carries its customer',
    (select count(*) from gl.journal_entry_line
      where entry_id = v_entry and account_id = test.account('1110') and customer_id is null),
    0);

  perform test.eq_num(v_suite, 'the receivables control account holds the migrated total',
    gl.account_balance_as_at(v_entity, test.account('1110'), v_cutover), 1800000);

  perform test.eq_num(v_suite, 'the payables line carries its supplier',
    (select count(*) from gl.journal_entry_line
      where entry_id = v_entry and account_id = test.account('2010') and supplier_id is null),
    0);

  -- Stock arrived in the sub-ledger, tied to the same journal entry.
  perform test.eq_num(v_suite, 'opening stock reached the stock ledger',
    (select coalesce(sum(quantity), 0) from inv.stock_ledger
      where entity_id = v_entity and movement_type = 'OPENING'),
    150);

  perform test.eq_num(v_suite, 'and it points at the cutover journal entry',
    (select count(*) from inv.stock_ledger
      where entity_id = v_entity and movement_type = 'OPENING' and journal_entry_id = v_entry),
    1);

  perform test.eq_num(v_suite, 'stock balances were established',
    (select value_base from inv.stock_balances
      where entity_id = v_entity and item_id = v_item and warehouse_id = v_wh),
    750000);

  select * into v_tie from inv.verify_inventory_ties_to_gl(v_entity, v_cutover);
  perform test.eq_num(v_suite, 'the inventory sub-ledger ties to the general ledger at cutover',
    v_tie.difference, 0);

  -- Posting twice must not double the opening position.
  perform test.eq(v_suite, 'posting the cutover again returns the same entry',
    gl.post_opening_balances(v_batch), v_entry);

  perform test.eq_num(v_suite, 'and does not create a second one',
    (select count(*) from gl.journal_entry
      where entity_id = v_entity and source_type = 'OPENING_BALANCE'),
    1);

  perform test.eq_num(v_suite, 'the ledger nets to zero after the cutover',
    (select sum(debit_base - credit_base) from gl.journal_entry_line where entity_id = v_entity),
    0);

  -- A second batch cannot be posted for the same entity.
  declare
    v_second uuid;
  begin
    insert into gl.ob_batch (entity_id, cutover_date, source_system)
    values (v_entity, v_cutover, 'QuickBooks Desktop')
    returning id into v_second;

    perform test.throws(v_suite,
      'a second cutover cannot be posted for the same entity',
      format('update gl.ob_batch set status = ''POSTED'' where id = %L', v_second),
      'ob_batch_single_posted_idx');
  end;
end;
$$;
