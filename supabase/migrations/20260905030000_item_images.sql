-- Product catalogue photos, stored on the item the same way the company logo
-- is stored on the entity: no storage bucket, writes only through SECURITY DEFINER.

set search_path = pg_catalog, public, extensions;

alter table inv.items
  add column if not exists image_mime text,
  add column if not exists image_bytes bytea;

alter table inv.items drop constraint if exists items_image_mime_chk;
alter table inv.items
  add constraint items_image_mime_chk
  check (
    image_mime is null
    or image_mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')
  );

comment on column inv.items.image_bytes is
  'Optional catalogue photo. Null means the product has no image.';

create or replace function inv.save_item_image(
  p_entity_id uuid,
  p_item_id   uuid,
  p_mime      text,
  p_bytes     bytea
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_permission(p_entity_id, 'masters.manage_items');

  if p_bytes is null or octet_length(p_bytes) = 0 then
    update inv.items
       set image_mime = null,
           image_bytes = null,
           updated_by = app.acting_user_id()
     where id = p_item_id and entity_id = p_entity_id;
    if not found then
      raise exception 'Item was not found' using errcode = 'no_data_found';
    end if;
    return p_item_id;
  end if;

  if p_mime is null or p_mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif') then
    raise exception 'Product image must be a PNG, JPEG, WebP or GIF'
      using errcode = 'check_violation';
  end if;

  if octet_length(p_bytes) > 1048576 then
    raise exception 'Product image must be 1 MB or smaller'
      using errcode = 'check_violation';
  end if;

  update inv.items
     set image_mime = p_mime,
         image_bytes = p_bytes,
         updated_by = app.acting_user_id()
   where id = p_item_id and entity_id = p_entity_id;

  if not found then
    raise exception 'Item was not found' using errcode = 'no_data_found';
  end if;

  return p_item_id;
end;
$$;

comment on function inv.save_item_image(uuid, uuid, text, bytea) is
  'Attaches, replaces or clears the catalogue photo on a product.';

grant execute on function inv.save_item_image(uuid, uuid, text, bytea) to skyjet_app;
