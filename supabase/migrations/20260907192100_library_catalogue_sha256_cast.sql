-- get_catalogue_document RETURNS TABLE(sha256 text) but documents.sha256 is
-- char(64). RETURN QUERY is strict about that.

create or replace function library.get_catalogue_document(p_entity_id uuid, p_document_id uuid)
returns table (
  id                 uuid,
  title              text,
  document_type      text,
  part_number        text,
  manufacturer       text,
  aircraft_type      text,
  aircraft_model     text,
  revision           text,
  version            text,
  effective_date     text,
  file_name          text,
  file_size          text,
  mime_type          text,
  status             text,
  classification     text,
  uploaded_by_name   text,
  created_at         text,
  tags               text[],
  description        text,
  storage_path       text,
  sha256             text,
  updated_at         text,
  has_extracted_text boolean,
  can_open           boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_open boolean;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');

  select library.actor_can_open(p_entity_id, d.id, d.classification)
    into v_open
    from library.documents d
   where d.id = p_document_id
     and d.entity_id = p_entity_id;

  if v_open is null then
    return;
  end if;

  return query
    select d.id,
           d.title,
           d.document_type,
           case when v_open then d.part_number end,
           case when v_open then d.manufacturer end,
           case when v_open then d.aircraft_type end,
           case when v_open then d.aircraft_model end,
           case when v_open then d.revision end,
           case when v_open then d.version end,
           case when v_open then d.effective_date::text end,
           case when v_open then d.file_name else '' end,
           case when v_open then d.file_size::text else '0' end,
           case when v_open then d.mime_type else '' end,
           d.status,
           d.classification,
           case when v_open then u.full_name end,
           to_char(d.created_at, 'YYYY-MM-DD HH24:MI'),
           case when v_open then coalesce((
             select array_agg(t.name order by t.name)
               from library.document_tags dt
               join library.tags t on t.id = dt.tag_id
              where dt.document_id = d.id
           ), '{}'::text[]) else '{}'::text[] end,
           case when v_open then d.description end,
           case when v_open then d.storage_path else '' end,
           case when v_open then d.sha256::text else '' end,
           case when v_open then to_char(d.updated_at, 'YYYY-MM-DD HH24:MI') end,
           case when v_open then (d.extracted_text is not null) else false end,
           v_open
      from library.documents d
      left join app.users u on u.id = d.uploaded_by
     where d.id = p_document_id
       and d.entity_id = p_entity_id;
end;
$$;

grant execute on function library.get_catalogue_document(uuid, uuid) to skyjet_app;
revoke all on function library.get_catalogue_document(uuid, uuid) from public, anon, authenticated;
