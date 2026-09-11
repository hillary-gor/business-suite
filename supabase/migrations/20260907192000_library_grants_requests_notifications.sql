-- ===========================================================================
-- Per-document grants, access requests, and in-app notifications.
--
-- Role clearance is unchanged. A grant lets one person open one file without
-- raising their role. Requesting is allowed because the catalogue peek shows
-- a locked title, not the file. Search still must not rank locked files by
-- extracted body text.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table library.document_grants (
  document_id uuid not null references library.documents (id) on delete cascade,
  user_id     uuid not null references app.users (id) on delete cascade,
  entity_id   uuid not null references app.entities (id) on delete restrict,
  granted_by  uuid references app.users (id),
  created_at  timestamptz not null default now(),
  primary key (document_id, user_id)
);

comment on table library.document_grants is
  'One person, one file. Complements role clearance; it is not a second classification.';

create table library.access_requests (
  id           uuid primary key default gen_random_uuid(),
  entity_id    uuid not null references app.entities (id) on delete restrict,
  document_id  uuid not null references library.documents (id) on delete cascade,
  requester_id uuid not null references app.users (id) on delete cascade,
  reason       text,
  status       text not null default 'pending',
  decided_by   uuid references app.users (id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint library_access_requests_status_chk
    check (status in ('pending', 'approved', 'denied', 'cancelled')),
  constraint library_access_requests_reason_chk
    check (reason is null or char_length(btrim(reason)) <= 400)
);

comment on table library.access_requests is
  'A person who can see a locked catalogue card asking to open that file.';

create unique index library_access_requests_open_uq
  on library.access_requests (document_id, requester_id)
  where status = 'pending';

create index library_access_requests_entity_idx
  on library.access_requests (entity_id, created_at desc);

create table library.notifications (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references app.entities (id) on delete restrict,
  user_id     uuid not null references app.users (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text,
  href        text,
  document_id uuid references library.documents (id) on delete cascade,
  request_id  uuid references library.access_requests (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  constraint library_notifications_kind_chk
    check (kind in ('access_requested', 'access_approved', 'access_denied'))
);

comment on table library.notifications is
  'In-app Library notices. Inserted by SECURITY DEFINER functions; the browser only reads its own rows.';

create index library_notifications_user_idx
  on library.notifications (user_id, created_at desc);

select app.enable_audit('library.document_grants');
select app.enable_audit('library.access_requests');
select app.enforce_rls_everywhere();

-- ---------------------------------------------------------------------------
-- Open vs peek
-- ---------------------------------------------------------------------------

create or replace function library.has_document_grant(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select exists (
    select 1
      from library.document_grants g
     where g.document_id = p_document_id
       and g.user_id = app.current_user_id()
  );
$$;

comment on function library.has_document_grant(uuid) is
  'True when the current actor holds a per-file grant. Does not read library.documents, so document RLS can call it.';

create or replace function library.actor_can_open(
  p_entity_id      uuid,
  p_document_id    uuid,
  p_classification text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    app.is_privileged_session()
    or library.can_read_document(p_entity_id, p_classification)
    or (
      app.user_has_entity_access(p_entity_id)
      and app.entity_has_module(p_entity_id, 'library')
      and app.user_has_permission(p_entity_id, 'library.document.read')
      and library.has_document_grant(p_document_id)
    );
$$;

create or replace function library.assert_readable(p_entity_id uuid, p_document_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_class text;
begin
  select d.classification into v_class
    from library.documents d
   where d.id = p_document_id
     and d.entity_id = p_entity_id;

  if v_class is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  if not library.actor_can_open(p_entity_id, p_document_id, v_class) then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  return v_class;
end;
$$;

drop policy if exists library_read_library_documents on library.documents;
create policy library_read_library_documents on library.documents
  for select to authenticated, skyjet_app
  using (
    library.can_read_document(entity_id, classification)
    or (
      app.user_has_entity_access(entity_id)
      and app.entity_has_module(entity_id, 'library')
      and app.user_has_permission(entity_id, 'library.document.read')
      and library.has_document_grant(id)
    )
  );

create policy library_read_document_grants on library.document_grants
  for select to authenticated, skyjet_app
  using (
    user_id = app.current_user_id()
    or (
      app.user_has_entity_access(entity_id)
      and app.user_has_permission(entity_id, 'library.document.manage')
    )
  );

create policy library_read_access_requests on library.access_requests
  for select to authenticated, skyjet_app
  using (
    requester_id = app.current_user_id()
    or (
      app.user_has_entity_access(entity_id)
      and app.user_has_permission(entity_id, 'library.document.manage')
    )
  );

create policy library_read_notifications on library.notifications
  for select to authenticated, skyjet_app
  using (user_id = app.current_user_id());

grant select on library.document_grants, library.access_requests, library.notifications
  to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on library.document_grants, library.access_requests, library.notifications
  from skyjet_app, authenticated, anon, public;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table library.notifications';
    exception
      when duplicate_object then
        null;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalogue peek: locked titles, not file bytes
-- ---------------------------------------------------------------------------

create or replace function library.list_catalogue(p_entity_id uuid, p_payload jsonb)
returns table (
  id               uuid,
  title            text,
  document_type    text,
  part_number      text,
  manufacturer     text,
  aircraft_type    text,
  aircraft_model   text,
  revision         text,
  version          text,
  effective_date   text,
  file_name        text,
  file_size        text,
  mime_type        text,
  status           text,
  classification   text,
  uploaded_by_name text,
  created_at       text,
  tags             text[],
  snippet          text,
  can_open         boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_status text := coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE');
  v_type   text := nullif(p_payload ->> 'document_type', '');
  v_class  text := nullif(p_payload ->> 'classification', '');
  v_q      text := nullif(btrim(coalesce(p_payload ->> 'q', '')), '');
  v_like   text := nullif(p_payload ->> 'like', '');
  v_tag    text := nullif(p_payload ->> 'tag', '');
  v_part   text := nullif(p_payload ->> 'part', '');
  v_limit  integer := least(coalesce((p_payload ->> 'limit')::integer, 200), 200);
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');

  return query
    select d.id,
           d.title,
           d.document_type,
           case when o.openable then d.part_number end,
           case when o.openable then d.manufacturer end,
           case when o.openable then d.aircraft_type end,
           case when o.openable then d.aircraft_model end,
           case when o.openable then d.revision end,
           case when o.openable then d.version end,
           case when o.openable then d.effective_date::text end,
           case when o.openable then d.file_name else '' end,
           case when o.openable then d.file_size::text else '0' end,
           case when o.openable then d.mime_type else '' end,
           d.status,
           d.classification,
           case when o.openable then u.full_name end,
           to_char(d.created_at, 'YYYY-MM-DD HH24:MI'),
           case when o.openable then coalesce((
             select array_agg(t.name order by t.name)
               from library.document_tags dt
               join library.tags t on t.id = dt.tag_id
              where dt.document_id = d.id
           ), '{}'::text[]) else '{}'::text[] end,
           case
             when v_q is null or not o.openable then null
             else ts_headline(
               'simple',
               d.title || ' ' || coalesce(d.description, ''),
               websearch_to_tsquery('simple', v_q),
               'MaxFragments=1, MaxWords=14, MinWords=4'
             )
           end,
           o.openable
      from library.documents d
      left join app.users u on u.id = d.uploaded_by
      cross join lateral (
        select library.actor_can_open(p_entity_id, d.id, d.classification) as openable
      ) o
     where d.entity_id = p_entity_id
       and d.status = v_status
       and (v_type is null or d.document_type = v_type)
       and (v_class is null or d.classification = v_class)
       and (
         v_q is null
         or (
           o.openable
           and (
             d.search_vector @@ websearch_to_tsquery('simple', v_q)
             or d.title ilike '%' || v_like || '%' escape '\'
             or coalesce(d.description, '') ilike '%' || v_like || '%' escape '\'
             or coalesce(d.part_number, '') ilike '%' || v_like || '%' escape '\'
             or coalesce(d.manufacturer, '') ilike '%' || v_like || '%' escape '\'
             or coalesce(d.aircraft_type, '') ilike '%' || v_like || '%' escape '\'
             or coalesce(d.file_name, '') ilike '%' || v_like || '%' escape '\'
             or exists (
               select 1
                 from library.document_tags dt
                 join library.tags t on t.id = dt.tag_id
                where dt.document_id = d.id
                  and t.name ilike '%' || v_like || '%' escape '\'
             )
           )
         )
         or (
           not o.openable
           and v_like is not null
           and d.title ilike '%' || v_like || '%' escape '\'
         )
       )
       and (
         v_part is null
         or (
           o.openable
           and coalesce(d.part_number, '') ilike '%' || v_part || '%' escape '\'
         )
       )
       and (
         v_tag is null
         or (
           o.openable
           and exists (
             select 1
               from library.document_tags dt
               join library.tags t on t.id = dt.tag_id
              where dt.document_id = d.id
                and lower(t.name) = lower(v_tag)
           )
         )
       )
     order by
       case
         when v_q is null then 0
         when o.openable then ts_rank_cd(d.search_vector, websearch_to_tsquery('simple', v_q))
         else 0
       end desc,
       d.created_at desc
     limit v_limit;
end;
$$;

comment on function library.list_catalogue(uuid, jsonb) is
  'Catalogue cards the actor may know exist. Locked rows are title and classification only. Body search does not run on files they cannot open.';

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

create or replace function library.peek_stats(p_entity_id uuid)
returns table (
  document_type  text,
  classification text,
  week_start     timestamptz,
  n              bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');

  return query
    select d.document_type,
           d.classification,
           date_trunc('week', d.created_at),
           count(*)::bigint
      from library.documents d
     where d.entity_id = p_entity_id
       and d.status = 'ACTIVE'
     group by 1, 2, 3;
end;
$$;

comment on function library.peek_stats(uuid) is
  'Counts every catalogue row the actor may know exists, including locked files. Does not expose file bytes.';

-- ---------------------------------------------------------------------------
-- Notifications helper
-- ---------------------------------------------------------------------------

create or replace function library.notify_user(
  p_entity_id   uuid,
  p_user_id     uuid,
  p_kind        text,
  p_title       text,
  p_body        text,
  p_href        text,
  p_document_id uuid,
  p_request_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  insert into library.notifications (
    entity_id, user_id, kind, title, body, href, document_id, request_id
  ) values (
    p_entity_id, p_user_id, p_kind, p_title, p_body, p_href, p_document_id, p_request_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests and grants
-- ---------------------------------------------------------------------------

create or replace function library.request_document_access(
  p_entity_id   uuid,
  p_document_id uuid,
  p_reason      text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_title  text;
  v_class  text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
  v_name   text;
  v_actor  uuid := app.current_user_id();
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');

  select d.title, d.classification
    into v_title, v_class
    from library.documents d
   where d.id = p_document_id and d.entity_id = p_entity_id;

  if v_title is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  if library.actor_can_open(p_entity_id, p_document_id, v_class) then
    raise exception 'You can already open this file' using errcode = 'check_violation';
  end if;

  if v_class = 'internal' then
    raise exception 'Internal files do not need a request' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from library.access_requests r
     where r.document_id = p_document_id
       and r.requester_id = v_actor
       and r.status = 'pending'
  ) then
    raise exception 'You already have a pending request' using errcode = 'check_violation';
  end if;

  insert into library.access_requests (entity_id, document_id, requester_id, reason)
  values (p_entity_id, p_document_id, v_actor, v_reason)
  returning id into v_id;

  select u.full_name into v_name from app.users u where u.id = v_actor;

  insert into library.notifications (
    entity_id, user_id, kind, title, body, href, document_id, request_id
  )
  select distinct
    p_entity_id,
    p.user_id,
    'access_requested',
    'Access requested',
    coalesce(v_name, 'Someone') || ' asked to open "' || v_title || '".',
    '/library/documents/' || p_document_id::text,
    p_document_id,
    v_id
  from app.user_effective_permissions p
  join app.users u on u.id = p.user_id and u.is_active
  where p.entity_id = p_entity_id
    and p.permission_code = 'library.document.manage'
    and p.user_id is distinct from v_actor;

  return v_id;
end;
$$;

create or replace function library.decide_document_access(
  p_entity_id  uuid,
  p_request_id uuid,
  p_approve    boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_req library.access_requests%rowtype;
  v_title text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  select * into v_req
    from library.access_requests
   where id = p_request_id
     and entity_id = p_entity_id;

  if not found then
    raise exception 'Access request was not found' using errcode = 'no_data_found';
  end if;

  if v_req.status is distinct from 'pending' then
    raise exception 'That request has already been decided' using errcode = 'check_violation';
  end if;

  select d.title into v_title
    from library.documents d
   where d.id = v_req.document_id;

  if p_approve then
    insert into library.document_grants (document_id, user_id, entity_id, granted_by)
    values (v_req.document_id, v_req.requester_id, p_entity_id, app.current_user_id())
    on conflict do nothing;

    update library.access_requests
       set status = 'approved',
           decided_by = app.current_user_id(),
           decided_at = now()
     where id = p_request_id;

    perform library.notify_user(
      p_entity_id,
      v_req.requester_id,
      'access_approved',
      'Access approved',
      'You can open "' || v_title || '".',
      '/library/documents/' || v_req.document_id::text,
      v_req.document_id,
      p_request_id
    );
  else
    update library.access_requests
       set status = 'denied',
           decided_by = app.current_user_id(),
           decided_at = now()
     where id = p_request_id;

    perform library.notify_user(
      p_entity_id,
      v_req.requester_id,
      'access_denied',
      'Access denied',
      'Your request to open "' || v_title || '" was refused.',
      '/library/documents/' || v_req.document_id::text,
      v_req.document_id,
      p_request_id
    );
  end if;

  return p_request_id;
end;
$$;

create or replace function library.revoke_document_grant(
  p_entity_id   uuid,
  p_document_id uuid,
  p_user_id     uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.manage');

  if not exists (
    select 1 from library.documents d
     where d.id = p_document_id and d.entity_id = p_entity_id
  ) then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  delete from library.document_grants
   where document_id = p_document_id
     and user_id = p_user_id
     and entity_id = p_entity_id;

  return p_document_id;
end;
$$;

create or replace function library.mark_notification_read(p_entity_id uuid, p_notification_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  update library.notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id
     and entity_id = p_entity_id
     and user_id = app.current_user_id();

  if not found then
    raise exception 'Notification was not found' using errcode = 'no_data_found';
  end if;

  return p_notification_id;
end;
$$;

grant execute on function
  library.has_document_grant(uuid),
  library.actor_can_open(uuid, uuid, text),
  library.list_catalogue(uuid, jsonb),
  library.get_catalogue_document(uuid, uuid),
  library.peek_stats(uuid),
  library.notify_user(uuid, uuid, text, text, text, text, uuid, uuid),
  library.request_document_access(uuid, uuid, text),
  library.decide_document_access(uuid, uuid, boolean),
  library.revoke_document_grant(uuid, uuid, uuid),
  library.mark_notification_read(uuid, uuid)
to skyjet_app;

revoke all on function
  library.has_document_grant(uuid),
  library.actor_can_open(uuid, uuid, text),
  library.list_catalogue(uuid, jsonb),
  library.get_catalogue_document(uuid, uuid),
  library.peek_stats(uuid),
  library.notify_user(uuid, uuid, text, text, text, text, uuid, uuid),
  library.request_document_access(uuid, uuid, text),
  library.decide_document_access(uuid, uuid, boolean),
  library.revoke_document_grant(uuid, uuid, uuid),
  library.mark_notification_read(uuid, uuid)
from public, anon, authenticated;
