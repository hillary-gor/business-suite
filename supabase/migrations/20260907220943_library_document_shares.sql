-- ===========================================================================
-- Share a library file with a colleague (in Library, by email, copied link,
-- or WhatsApp). The trail records who shared, when, and how. Internal and
-- email shares notify the recipient in the Library bell. The file bytes are
-- never emailed. A manager who shares a locked file may grant that one file;
-- a viewer who shares only notifies.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

alter table library.notifications
  drop constraint library_notifications_kind_chk;

alter table library.notifications
  add constraint library_notifications_kind_chk
    check (kind in (
      'access_requested',
      'access_approved',
      'access_denied',
      'comment_added',
      'document_shared'
    ));

create table library.document_shares (
  id                 uuid primary key default gen_random_uuid(),
  entity_id          uuid not null references app.entities (id) on delete restrict,
  document_id        uuid not null references library.documents (id) on delete cascade,
  shared_by          uuid not null references app.users (id),
  channel            text not null,
  recipient_user_id  uuid references app.users (id),
  recipient_email    text,
  note               text,
  granted_access     boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint library_document_shares_channel_chk
    check (channel in ('internal', 'email', 'link', 'whatsapp')),
  constraint library_document_shares_recipient_chk
    check (
      (channel in ('internal', 'email') and recipient_user_id is not null)
      or
      (channel in ('link', 'whatsapp') and recipient_user_id is null and recipient_email is null)
    ),
  constraint library_document_shares_note_chk
    check (note is null or char_length(note) between 1 and 400)
);

comment on table library.document_shares is
  'Who shared a library file, when, and how. Inserted only by SECURITY DEFINER functions. File bytes are never stored here.';

create index library_document_shares_document_idx
  on library.document_shares (document_id, created_at desc, id);

create index library_document_shares_recipient_idx
  on library.document_shares (recipient_user_id)
  where recipient_user_id is not null;

select app.enable_audit('library.document_shares');
select app.enforce_rls_everywhere();

create policy library_read_document_shares on library.document_shares
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1
        from library.documents d
       where d.id = document_id
    )
  );

grant select on library.document_shares to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on library.document_shares
  from skyjet_app, authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Whether another person (not the current actor) may open this file.
-- ---------------------------------------------------------------------------

create or replace function library.user_can_open(
  p_entity_id      uuid,
  p_document_id    uuid,
  p_classification text,
  p_user_id        uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    app.user_has_entity_access(p_entity_id, p_user_id)
    and app.entity_has_module(p_entity_id, 'library')
    and app.user_has_permission(p_entity_id, 'library.document.read', p_user_id)
    and (
      (
        p_classification = 'internal'
        or (
          p_classification = 'confidential'
          and app.user_has_permission(p_entity_id, 'library.document.read_confidential', p_user_id)
        )
        or (
          p_classification = 'restricted'
          and app.user_has_permission(p_entity_id, 'library.document.read_restricted', p_user_id)
        )
      )
      or exists (
        select 1
          from library.document_grants g
         where g.document_id = p_document_id
           and g.user_id = p_user_id
      )
    );
$$;

comment on function library.user_can_open(uuid, uuid, text, uuid) is
  'True when that person may open this file by clearance or a per-file grant. Used when sharing, not as a public directory.';

-- Workplace cards also cover people on the share trail.
create or replace function library.get_document_person(
  p_entity_id   uuid,
  p_document_id uuid,
  p_user_id     uuid
)
returns table (
  id        uuid,
  full_name text,
  email     text,
  job_title text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_ok boolean;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  select exists (
           select 1
             from library.documents d
            where d.id = p_document_id
              and d.entity_id = p_entity_id
              and d.uploaded_by = p_user_id
         )
         or exists (
           select 1
             from library.document_comments c
            where c.document_id = p_document_id
              and c.entity_id = p_entity_id
              and c.author_id = p_user_id
         )
         or exists (
           select 1
             from library.document_shares s
            where s.document_id = p_document_id
              and s.entity_id = p_entity_id
              and (s.shared_by = p_user_id or s.recipient_user_id = p_user_id)
         )
    into v_ok;

  if not v_ok then
    raise exception 'Person was not found' using errcode = 'no_data_found';
  end if;

  return query
    select u.id,
           u.full_name,
           u.email,
           u.job_title
      from app.users u
     where u.id = p_user_id;
end;
$$;

comment on function library.get_document_person(uuid, uuid, uuid) is
  'Workplace card for the uploader, a commenter, or someone on the share trail of a file the actor can open. Never returns phone.';

-- ---------------------------------------------------------------------------
-- Colleague picker: people in this organisation who can use Library.
-- ---------------------------------------------------------------------------

create or replace function library.list_share_colleagues(
  p_entity_id   uuid,
  p_document_id uuid,
  p_query       text
)
returns table (
  id        uuid,
  full_name text,
  email     text,
  job_title text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  if v_q is not null and char_length(v_q) > 80 then
    raise exception 'Search is too long' using errcode = 'check_violation';
  end if;

  return query
    select u.id,
           u.full_name,
           u.email,
           u.job_title
      from app.users u
     where u.is_active
       and u.id is distinct from app.current_user_id()
       and exists (
         select 1
           from app.user_roles ur
          where ur.user_id = u.id
            and ur.entity_id = p_entity_id
            and (ur.expires_at is null or ur.expires_at > now())
       )
       and app.user_has_permission(p_entity_id, 'library.document.read', u.id)
       and (
         v_q is null
         or position(lower(v_q) in lower(u.full_name)) > 0
         or position(lower(v_q) in lower(u.email)) > 0
       )
     order by u.full_name, u.email, u.id
     limit 40;
end;
$$;

comment on function library.list_share_colleagues(uuid, uuid, text) is
  'People in this organisation who can use Library, for sharing a file the actor can open. Name, email and job title only.';

create or replace function library.list_document_shares(
  p_entity_id   uuid,
  p_document_id uuid
)
returns table (
  id                 uuid,
  shared_by          uuid,
  shared_by_name     text,
  channel            text,
  recipient_user_id  uuid,
  recipient_name     text,
  recipient_email    text,
  note               text,
  granted_access     boolean,
  created_at         text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  return query
    select s.id,
           s.shared_by,
           sharer.full_name,
           s.channel,
           s.recipient_user_id,
           recipient.full_name,
           s.recipient_email,
           s.note,
           s.granted_access,
           to_char(s.created_at, 'YYYY-MM-DD HH24:MI')
      from library.document_shares s
      left join app.users sharer on sharer.id = s.shared_by
      left join app.users recipient on recipient.id = s.recipient_user_id
     where s.entity_id = p_entity_id
       and s.document_id = p_document_id
     order by s.created_at desc, s.id desc;
end;
$$;

comment on function library.list_document_shares(uuid, uuid) is
  'Share trail for a file the actor can open: who shared, when, how, and with whom.';

create or replace function library.share_document(
  p_entity_id          uuid,
  p_document_id        uuid,
  p_channel            text,
  p_recipient_user_id  uuid,
  p_note               text
)
returns table (
  share_id      uuid,
  granted       boolean,
  already_open  boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_title     text;
  v_class     text;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_channel   text := btrim(coalesce(p_channel, ''));
  v_actor     uuid := app.current_user_id();
  v_recipient uuid := p_recipient_user_id;
  v_email     text;
  v_name      text;
  v_sharer    text;
  v_id        uuid;
  v_granted   boolean := false;
  v_open      boolean := false;
  v_body      text;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  if v_channel not in ('internal', 'email', 'link', 'whatsapp') then
    raise exception 'Choose how to share' using errcode = 'check_violation';
  end if;

  if v_note is not null and char_length(v_note) > 400 then
    raise exception 'The note is too long' using errcode = 'check_violation';
  end if;

  select d.title, d.classification
    into v_title, v_class
    from library.documents d
   where d.id = p_document_id
     and d.entity_id = p_entity_id;

  if v_title is null then
    raise exception 'Document was not found' using errcode = 'no_data_found';
  end if;

  select u.full_name into v_sharer
    from app.users u
   where u.id = v_actor;

  if v_channel in ('link', 'whatsapp') then
    if v_recipient is not null then
      raise exception 'A copied link does not name a recipient' using errcode = 'check_violation';
    end if;

    insert into library.document_shares (
      entity_id, document_id, shared_by, channel, note
    ) values (
      p_entity_id, p_document_id, v_actor, v_channel, v_note
    )
    returning id into v_id;

    return query select v_id, false, false;
    return;
  end if;

  if v_recipient is null then
    raise exception 'Choose a colleague' using errcode = 'check_violation';
  end if;

  if v_recipient = v_actor then
    raise exception 'You cannot share a file with yourself' using errcode = 'check_violation';
  end if;

  if not exists (
       select 1
         from app.user_roles ur
        where ur.user_id = v_recipient
          and ur.entity_id = p_entity_id
          and (ur.expires_at is null or ur.expires_at > now())
     )
     or not app.user_has_permission(p_entity_id, 'library.document.read', v_recipient) then
    raise exception 'That person cannot use Library' using errcode = 'check_violation';
  end if;

  select u.full_name, u.email
    into v_name, v_email
    from app.users u
   where u.id = v_recipient
     and u.is_active;

  if v_email is null then
    raise exception 'That person cannot use Library' using errcode = 'check_violation';
  end if;

  v_open := library.user_can_open(p_entity_id, p_document_id, v_class, v_recipient);

  if not v_open
     and v_class is distinct from 'internal'
     and app.user_has_permission(p_entity_id, 'library.document.manage') then
    insert into library.document_grants (document_id, user_id, entity_id, granted_by)
    values (p_document_id, v_recipient, p_entity_id, v_actor)
    on conflict do nothing;

    update library.access_requests
       set status = 'approved',
           decided_by = v_actor,
           decided_at = now()
     where document_id = p_document_id
       and entity_id = p_entity_id
       and requester_id = v_recipient
       and status = 'pending';

    v_granted := true;
    v_open := true;
  end if;

  insert into library.document_shares (
    entity_id,
    document_id,
    shared_by,
    channel,
    recipient_user_id,
    recipient_email,
    note,
    granted_access
  ) values (
    p_entity_id,
    p_document_id,
    v_actor,
    v_channel,
    v_recipient,
    v_email,
    v_note,
    v_granted
  )
  returning id into v_id;

  if v_granted then
    v_body := coalesce(v_sharer, 'Someone')
      || ' shared "' || v_title || '" with you. You can open it now.';
  elsif v_open then
    v_body := coalesce(v_sharer, 'Someone')
      || ' shared "' || v_title || '" with you.';
  else
    v_body := coalesce(v_sharer, 'Someone')
      || ' pointed you to "' || v_title
      || '". Request access if the file is locked.';
  end if;

  perform library.notify_user(
    p_entity_id,
    v_recipient,
    'document_shared',
    'A file was shared with you',
    v_body,
    '/library/documents/' || p_document_id::text,
    p_document_id,
    null
  );

  return query select v_id, v_granted, v_open;
end;
$$;

comment on function library.share_document(uuid, uuid, text, uuid, text) is
  'Records a share of a file the actor can open. Internal and email notify the recipient. Managers may grant that one file; viewers never raise clearance. Does not send email itself.';

grant execute on function
  library.user_can_open(uuid, uuid, text, uuid),
  library.list_share_colleagues(uuid, uuid, text),
  library.list_document_shares(uuid, uuid),
  library.share_document(uuid, uuid, text, uuid, text),
  library.get_document_person(uuid, uuid, uuid)
to skyjet_app;

revoke all on function
  library.user_can_open(uuid, uuid, text, uuid),
  library.list_share_colleagues(uuid, uuid, text),
  library.list_document_shares(uuid, uuid),
  library.share_document(uuid, uuid, text, uuid, text)
from public, anon, authenticated;
