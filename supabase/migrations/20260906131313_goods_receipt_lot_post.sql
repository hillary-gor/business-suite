-- Lot-tracked goods receipts must pass a stock_lot_id into inv.post_movement.
-- The GRN line only stores serial_number, so treat that value as the lot number
-- (find-or-create inv.stock_lots). Also create MAIN when a warehouse has none.

create or replace function purch.post_goods_receipt(
  p_grn_id          uuid,
  p_idempotency_key text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_grn        purch.goods_receipts%rowtype;
  v_line       purch.goods_receipt_lines%rowtype;
  v_item       inv.items%rowtype;
  v_bin        uuid;
  v_unit       uuid;
  v_lot        uuid;
  v_ledger_id  bigint;
  v_grn_no     text;
  v_key        text;
begin
  perform app.require_permission(
    (select entity_id from purch.goods_receipts where id = p_grn_id),
    'procurement.purchase.receive'
  );

  select * into v_grn from purch.goods_receipts where id = p_grn_id for update;
  if not found then
    raise exception 'Goods receipt % does not exist', p_grn_id using errcode = 'no_data_found';
  end if;
  if v_grn.status = 'POSTED' then
    return v_grn.grn_no;
  end if;
  if v_grn.status <> 'DRAFT' then
    raise exception 'Only a draft goods receipt can be posted' using errcode = 'restrict_violation';
  end if;

  if not exists (select 1 from purch.goods_receipt_lines where goods_receipt_id = v_grn.id) then
    raise exception 'A goods receipt needs at least one line' using errcode = 'check_violation';
  end if;

  v_grn_no := app.next_document_number(v_grn.entity_id, 'GRN', v_grn.receipt_date);

  for v_line in
    select * from purch.goods_receipt_lines
     where goods_receipt_id = v_grn.id
     order by line_no
  loop
    select * into v_item from inv.items where id = v_line.item_id and entity_id = v_grn.entity_id;
    if not found then
      raise exception 'Line %: item was not found', v_line.line_no using errcode = 'no_data_found';
    end if;

    v_bin := v_line.bin_id;
    if v_bin is null then
      select id into v_bin
        from inv.bins
       where warehouse_id = v_grn.warehouse_id
         and code = 'MAIN'
         and is_active
       limit 1;
    end if;

    if v_bin is null then
      insert into inv.bins (
        entity_id, warehouse_id, code, name, bin_type, created_by, updated_by
      ) values (
        v_grn.entity_id, v_grn.warehouse_id, 'MAIN', 'Main Bin', 'STOCK',
        app.acting_user_id(), app.acting_user_id()
      )
      on conflict (warehouse_id, code) do update
        set is_active = true
      returning id into v_bin;
    end if;

    v_unit := v_line.stock_unit_id;
    v_lot := null;

    if v_item.tracking_mode = 'SERIAL' then
      if v_line.quantity <> 1 then
        raise exception 'Line %: serialised receipts are one unit at a time', v_line.line_no
          using errcode = 'check_violation';
      end if;

      if v_unit is null then
        if length(btrim(coalesce(v_line.serial_number, ''))) = 0 then
          raise exception 'Line %: serial_number is required for a serialised item', v_line.line_no
            using errcode = 'null_value_not_allowed';
        end if;
        if v_bin is null then
          raise exception 'Line %: a bin is required to create a stock unit', v_line.line_no
            using errcode = 'null_value_not_allowed';
        end if;

        insert into inv.stock_units (
          entity_id, item_id, serial_number, condition_code, status,
          warehouse_id, bin_id, supplier_id, received_date,
          acquisition_currency, acquisition_cost, unit_cost_base, created_by
        ) values (
          v_grn.entity_id, v_line.item_id, v_line.serial_number,
          coalesce(v_line.condition_code, 'OH'), 'ON_HAND',
          v_grn.warehouse_id, v_bin, v_grn.supplier_id, v_grn.receipt_date,
          (select base_currency_code from app.entities where id = v_grn.entity_id),
          v_line.unit_cost, v_line.unit_cost, app.acting_user_id()
        )
        returning id into v_unit;

        update purch.goods_receipt_lines
           set stock_unit_id = v_unit
         where id = v_line.id;
      end if;
    elsif v_item.tracking_mode = 'LOT' then
      if length(btrim(coalesce(v_line.serial_number, ''))) = 0 then
        raise exception 'Line %: lot number is required for a lot-tracked item', v_line.line_no
          using errcode = 'null_value_not_allowed';
      end if;

      insert into inv.stock_lots (
        entity_id, item_id, lot_number, condition_code, received_date, supplier_id, created_by
      ) values (
        v_grn.entity_id, v_line.item_id, btrim(v_line.serial_number),
        coalesce(v_line.condition_code, 'OH'), v_grn.receipt_date, v_grn.supplier_id,
        app.acting_user_id()
      )
      on conflict (entity_id, item_id, lot_number) do update
        set updated_at = now()
      returning id into v_lot;
    end if;

    v_key := case
      when p_idempotency_key is not null then p_idempotency_key || ':grn-line:' || v_line.line_no
      else null
    end;

    v_ledger_id := inv.post_movement(
      p_entity_id => v_grn.entity_id,
      p_item_id => v_line.item_id,
      p_warehouse_id => v_grn.warehouse_id,
      p_movement_type => 'RECEIPT',
      p_movement_date => v_grn.receipt_date,
      p_quantity => v_line.quantity,
      p_bin_id => v_bin,
      p_stock_unit_id => v_unit,
      p_stock_lot_id => v_lot,
      p_unit_cost_base => v_line.unit_cost,
      p_source_type => 'GOODS_RECEIPT',
      p_source_id => v_grn.id,
      p_source_line_id => v_line.id,
      p_reference => v_grn_no,
      p_notes => v_line.description,
      p_idempotency_key => v_key
    );

    update purch.goods_receipt_lines
       set stock_ledger_id = v_ledger_id,
           bin_id = coalesce(bin_id, v_bin)
     where id = v_line.id;
  end loop;

  perform set_config('purch.allow_status_change', 'on', true);

  update purch.goods_receipts
     set status = 'POSTED',
         grn_no = v_grn_no,
         posted_at = now(),
         posted_by = app.acting_user_id()
   where id = v_grn.id;

  perform set_config('purch.allow_status_change', '', true);

  return v_grn_no;
end;
$$;

comment on function purch.post_goods_receipt(uuid, text) is
  'Posts a GRN: creates serial stock units or lot records when needed, then inv.post_movement(RECEIPT). Requires procurement.purchase.receive.';
