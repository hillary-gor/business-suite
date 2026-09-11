-- Address formatting and supplier statements for printable documents.

create or replace function app.format_address(p_address_id uuid)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select nullif(concat_ws(E'\n',
    nullif(btrim(a.line1), ''),
    nullif(btrim(a.line2), ''),
    nullif(btrim(concat_ws(' ', nullif(btrim(a.city), ''), nullif(btrim(a.postal_code), ''))), ''),
    nullif(btrim(a.region), ''),
    case a.country_code
      when 'KE' then 'Kenya'
      else nullif(btrim(a.country_code), '')
    end
  ), '')
    from app.addresses a
   where a.id = p_address_id
$$;

comment on function app.format_address(uuid) is
  'Letterhead-style address: lines separated by newlines. Returns null when the id is missing or empty.';

create or replace function purch.supplier_statement(
  p_entity_id   uuid,
  p_supplier_id uuid,
  p_as_of       date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_result jsonb;
begin
  perform app.require_permission(p_entity_id, 'finance.payment.create');

  if not exists (
    select 1 from app.suppliers s
     where s.id = p_supplier_id and s.entity_id = p_entity_id
  ) then
    raise exception 'Supplier was not found in this entity' using errcode = 'no_data_found';
  end if;

  select jsonb_build_object(
    'supplier_id', p_supplier_id,
    'as_of', p_as_of,
    'open_bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bill_id', b.id,
        'bill_no', b.bill_no,
        'bill_date', b.bill_date,
        'due_date', b.due_date,
        'total', b.total,
        'outstanding', bal.outstanding,
        'currency_code', b.currency_code
      ) order by b.bill_date, b.bill_no)
        from purch.bills b
        join purch.v_bill_balances bal on bal.id = b.id
       where b.entity_id = p_entity_id
         and b.supplier_id = p_supplier_id
         and b.status = 'POSTED'
         and b.bill_date <= p_as_of
         and bal.outstanding > 0
    ), '[]'::jsonb),
    'recent_activity', coalesce((
      select jsonb_agg(x.row order by x.sort_date desc, x.doc_no)
        from (
          select b.bill_date as sort_date, b.bill_no as doc_no,
                 jsonb_build_object(
                   'type', 'BILL',
                   'id', b.id,
                   'doc_no', b.bill_no,
                   'doc_date', b.bill_date,
                   'amount', b.total,
                   'status', b.status::text
                 ) as row
            from purch.bills b
           where b.entity_id = p_entity_id and b.supplier_id = p_supplier_id
             and b.bill_date <= p_as_of and b.status in ('POSTED', 'VOIDED')
          union all
          select p.payment_date, p.payment_no,
                 jsonb_build_object(
                   'type', 'PAYMENT',
                   'id', p.id,
                   'doc_no', p.payment_no,
                   'doc_date', p.payment_date,
                   'amount', p.amount,
                   'status', p.status::text
                 )
            from purch.supplier_payments p
           where p.entity_id = p_entity_id and p.supplier_id = p_supplier_id
             and p.payment_date <= p_as_of and p.status = 'POSTED'
          union all
          select c.credit_date, c.credit_no,
                 jsonb_build_object(
                   'type', 'CREDIT',
                   'id', c.id,
                   'doc_no', c.credit_no,
                   'doc_date', c.credit_date,
                   'amount', c.total,
                   'status', c.status::text
                 )
            from purch.supplier_credits c
           where c.entity_id = p_entity_id and c.supplier_id = p_supplier_id
             and c.credit_date <= p_as_of and c.status = 'POSTED'
        ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function purch.supplier_statement(uuid, uuid, date) is
  'Open posted bills and recent AP activity as of a date. Requires finance.payment.create.';

grant execute on function app.format_address(uuid) to skyjet_app;
grant execute on function purch.supplier_statement(uuid, uuid, date) to skyjet_app;
