-- Company profile write path for Account and settings.
-- Code and functional currency stay immutable here — changing either would
-- rewrite the books.

set search_path = pg_catalog, public, extensions;

create or replace function app.save_entity(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_legal text := btrim(coalesce(p_payload ->> 'legal_name', ''));
  v_month smallint := coalesce(nullif(p_payload ->> 'fiscal_year_start_month', '')::smallint, 1);
  v_country char(2) := upper(coalesce(nullif(p_payload ->> 'country_code', ''), 'KE'));
begin
  perform app.require_permission(p_entity_id, 'settings.manage');

  if v_legal = '' then
    raise exception 'legal_name is required' using errcode = 'null_value_not_allowed';
  end if;
  if v_month not between 1 and 12 then
    raise exception 'fiscal_year_start_month must be between 1 and 12' using errcode = 'check_violation';
  end if;
  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'country_code must be a two-letter ISO code' using errcode = 'check_violation';
  end if;

  update app.entities
     set legal_name = v_legal,
         trading_name = nullif(btrim(coalesce(p_payload ->> 'trading_name', '')), ''),
         tax_pin = nullif(btrim(coalesce(p_payload ->> 'tax_pin', '')), ''),
         registration_number = nullif(btrim(coalesce(p_payload ->> 'registration_number', '')), ''),
         country_code = v_country,
         fiscal_year_start_month = v_month,
         timezone = coalesce(nullif(btrim(coalesce(p_payload ->> 'timezone', '')), ''), timezone),
         address_line1 = nullif(btrim(coalesce(p_payload ->> 'address_line1', '')), ''),
         address_line2 = nullif(btrim(coalesce(p_payload ->> 'address_line2', '')), ''),
         city = nullif(btrim(coalesce(p_payload ->> 'city', '')), ''),
         postal_code = nullif(btrim(coalesce(p_payload ->> 'postal_code', '')), ''),
         phone = nullif(btrim(coalesce(p_payload ->> 'phone', '')), ''),
         email = nullif(btrim(coalesce(p_payload ->> 'email', '')), ''),
         updated_by = app.acting_user_id()
   where id = p_entity_id;

  if not found then
    raise exception 'Entity was not found' using errcode = 'no_data_found';
  end if;

  return p_entity_id;
end;
$$;

grant execute on function app.save_entity(uuid, jsonb) to skyjet_app;
