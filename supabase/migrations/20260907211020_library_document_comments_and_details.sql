-- ===========================================================================
-- Document comments, reactions, and a workplace card for people on a file.
--
-- Comments are for people who can already open the file. The bell tells the
-- uploader and people who already commented — not everyone who once viewed it.
-- The colleague card is name, email and job title; never phone.
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
      'comment_added'
    ));

create table library.document_comments (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references app.entities (id) on delete restrict,
  document_id uuid not null references library.documents (id) on delete cascade,
  author_id   uuid not null references app.users (id),
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint library_document_comments_body_chk
    check (char_length(btrim(body)) between 1 and 2000)
);

comment on table library.document_comments is
  'Notes on a library file. Anyone who can open the document may read and write. Inserted by SECURITY DEFINER functions.';

create index library_document_comments_document_idx
  on library.document_comments (document_id, created_at, id);

create table library.document_comment_reactions (
  comment_id uuid not null references library.document_comments (id) on delete cascade,
  user_id    uuid not null references app.users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji),
  constraint library_document_comment_reactions_emoji_chk
    check (emoji in ('thumbs', 'check', 'eyes', 'flag'))
);

comment on table library.document_comment_reactions is
  'Per-user reactions on a document comment. One row per person per allowed emoji.';

create index library_document_comment_reactions_comment_idx
  on library.document_comment_reactions (comment_id);

select app.enable_audit('library.document_comments');
select app.enable_audit('library.document_comment_reactions');
select app.enforce_rls_everywhere();

-- Peek-only viewers cannot SELECT library.documents for locked files, so they
-- cannot see comments either. People who can open the file can read the thread.
create policy library_read_document_comments on library.document_comments
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1
        from library.documents d
       where d.id = document_id
    )
  );

create policy library_read_document_comment_reactions on library.document_comment_reactions
  for select to authenticated, skyjet_app
  using (
    exists (
      select 1
        from library.document_comments c
       where c.id = comment_id
    )
  );

grant select on library.document_comments, library.document_comment_reactions
  to skyjet_app, authenticated;

revoke insert, update, delete, truncate
  on library.document_comments, library.document_comment_reactions
  from skyjet_app, authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- Workplace card: only people already on a file the actor can open
-- ---------------------------------------------------------------------------

create or replace function library.get_document_uploader(
  p_entity_id   uuid,
  p_document_id uuid
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
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  return query
    select u.id,
           u.full_name,
           u.email,
           u.job_title
      from library.documents d
      join app.users u on u.id = d.uploaded_by
     where d.id = p_document_id
       and d.entity_id = p_entity_id;
end;
$$;

comment on function library.get_document_uploader(uuid, uuid) is
  'Name, email and job title of the person who uploaded a file the actor can open. Never returns phone.';

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
  'Workplace card for the uploader or a commenter on a file the actor can open. Not a People-admin lookup.';

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

create or replace function library.list_document_comments(
  p_entity_id   uuid,
  p_document_id uuid
)
returns table (
  id               uuid,
  author_id        uuid,
  author_name      text,
  body             text,
  created_at       text,
  reaction_thumbs  integer,
  reaction_check   integer,
  reaction_eyes    integer,
  reaction_flag    integer,
  mine             text[]
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
    select c.id,
           c.author_id,
           u.full_name,
           c.body,
           to_char(c.created_at, 'YYYY-MM-DD HH24:MI'),
           (
             select count(*)::integer
               from library.document_comment_reactions r
              where r.comment_id = c.id
                and r.emoji = 'thumbs'
           ),
           (
             select count(*)::integer
               from library.document_comment_reactions r
              where r.comment_id = c.id
                and r.emoji = 'check'
           ),
           (
             select count(*)::integer
               from library.document_comment_reactions r
              where r.comment_id = c.id
                and r.emoji = 'eyes'
           ),
           (
             select count(*)::integer
               from library.document_comment_reactions r
              where r.comment_id = c.id
                and r.emoji = 'flag'
           ),
           coalesce((
             select array_agg(r.emoji order by r.emoji)
               from library.document_comment_reactions r
              where r.comment_id = c.id
                and r.user_id = app.current_user_id()
           ), '{}'::text[])
      from library.document_comments c
      left join app.users u on u.id = c.author_id
     where c.entity_id = p_entity_id
       and c.document_id = p_document_id
     order by c.created_at, c.id;
end;
$$;

create or replace function library.add_document_comment(
  p_entity_id   uuid,
  p_document_id uuid,
  p_body        text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_title text;
  v_body  text := btrim(coalesce(p_body, ''));
  v_id    uuid;
  v_user  uuid;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');
  perform library.assert_readable(p_entity_id, p_document_id);

  if char_length(v_body) < 1 then
    raise exception 'Comment cannot be empty' using errcode = 'check_violation';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'Comment is too long' using errcode = 'check_violation';
  end if;

  insert into library.document_comments (entity_id, document_id, author_id, body)
  values (p_entity_id, p_document_id, app.current_user_id(), v_body)
  returning id into v_id;

  select d.title into v_title
    from library.documents d
   where d.id = p_document_id
     and d.entity_id = p_entity_id;

  -- Uploader and prior commenters. Not everyone who opened the file.
  -- The notice does not repeat the comment text, so a later loss of
  -- clearance cannot leak the thread through the bell.
  for v_user in
    select distinct x.user_id
      from (
        select d.uploaded_by as user_id
          from library.documents d
         where d.id = p_document_id
           and d.entity_id = p_entity_id
           and d.uploaded_by is not null
        union
        select c.author_id
          from library.document_comments c
         where c.document_id = p_document_id
           and c.entity_id = p_entity_id
           and c.id <> v_id
      ) x
      join app.users u on u.id = x.user_id
     where x.user_id is distinct from app.current_user_id()
       and u.is_active
     order by x.user_id
     limit 50
  loop
    perform library.notify_user(
      p_entity_id,
      v_user,
      'comment_added',
      'Comment on ' || left(coalesce(v_title, 'a document'), 80),
      'Open the file to read the thread.',
      '/library/documents/' || p_document_id::text,
      p_document_id,
      null
    );
  end loop;

  return v_id;
end;
$$;

comment on function library.add_document_comment(uuid, uuid, text) is
  'Adds a comment on a file the actor can open. Notifies the uploader and prior commenters, not the access log.';

create or replace function library.toggle_comment_reaction(
  p_entity_id   uuid,
  p_document_id uuid,
  p_comment_id  uuid,
  p_emoji       text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_doc uuid;
begin
  perform app.require_module(p_entity_id, 'library');
  perform app.require_permission(p_entity_id, 'library.document.read');

  if p_emoji is null or p_emoji not in ('thumbs', 'check', 'eyes', 'flag') then
    raise exception 'That reaction is not allowed' using errcode = 'check_violation';
  end if;

  select c.document_id into v_doc
    from library.document_comments c
   where c.id = p_comment_id
     and c.entity_id = p_entity_id
     and c.document_id = p_document_id;

  if v_doc is null then
    raise exception 'Comment was not found' using errcode = 'no_data_found';
  end if;

  perform library.assert_readable(p_entity_id, v_doc);

  delete from library.document_comment_reactions
   where comment_id = p_comment_id
     and user_id = app.current_user_id()
     and emoji = p_emoji;

  if found then
    return false;
  end if;

  insert into library.document_comment_reactions (comment_id, user_id, emoji)
  values (p_comment_id, app.current_user_id(), p_emoji);

  return true;
end;
$$;

grant execute on function
  library.get_document_uploader(uuid, uuid),
  library.get_document_person(uuid, uuid, uuid),
  library.list_document_comments(uuid, uuid),
  library.add_document_comment(uuid, uuid, text),
  library.toggle_comment_reaction(uuid, uuid, uuid, text)
to skyjet_app;

revoke all on function
  library.get_document_uploader(uuid, uuid),
  library.get_document_person(uuid, uuid, uuid),
  library.list_document_comments(uuid, uuid),
  library.add_document_comment(uuid, uuid, text),
  library.toggle_comment_reaction(uuid, uuid, uuid, text)
from public, anon, authenticated;
