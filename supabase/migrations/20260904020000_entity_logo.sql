-- Company logo stored on the entity so invoices and the shell can render it
-- without a storage bucket. The application role still has no DML on
-- app.entities; uploads go through this SECURITY DEFINER function.

set search_path = pg_catalog, public, extensions;

alter table app.entities
  add column if not exists logo_mime text,
  add column if not exists logo_bytes bytea;

alter table app.entities drop constraint if exists entities_logo_mime_chk;
alter table app.entities
  add constraint entities_logo_mime_chk
  check (
    logo_mime is null
    or logo_mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  );

comment on column app.entities.logo_bytes is
  'Company mark shown in the app chrome and on customer-facing documents. Null means the product default is used.';

create or replace function app.save_entity_logo(
  p_entity_id uuid,
  p_mime      text,
  p_bytes     bytea
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_permission(p_entity_id, 'settings.manage');

  if p_bytes is null or octet_length(p_bytes) = 0 then
    update app.entities
       set logo_mime = null,
           logo_bytes = null,
           updated_by = app.acting_user_id()
     where id = p_entity_id;
    if not found then
      raise exception 'Entity was not found' using errcode = 'no_data_found';
    end if;
    return p_entity_id;
  end if;

  if p_mime is null or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
    raise exception 'Logo must be a PNG, JPEG, WebP or GIF image' using errcode = 'check_violation';
  end if;

  if octet_length(p_bytes) > 1048576 then
    raise exception 'Logo must be 1 MB or smaller' using errcode = 'check_violation';
  end if;

  update app.entities
     set logo_mime = p_mime,
         logo_bytes = p_bytes,
         updated_by = app.acting_user_id()
   where id = p_entity_id;

  if not found then
    raise exception 'Entity was not found' using errcode = 'no_data_found';
  end if;

  return p_entity_id;
end;
$$;

grant execute on function app.save_entity_logo(uuid, text, bytea) to skyjet_app;
