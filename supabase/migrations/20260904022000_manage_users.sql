-- Invite and role assignment from Account settings.
--
-- Identity still belongs to hosted Auth. These functions never insert into
-- auth.users: the application creates or looks up that row, then calls here
-- with the same id. What they do is grant application access — an app.users
-- row and exactly one role in the entity — under users.manage.
--
-- The last remaining owner cannot be demoted or deactivated. That is the
-- only way an entity can lose the person who can still grant access.

set search_path = pg_catalog, public, extensions;

create or replace function app.auth_user_id_for_email(p_entity_id uuid, p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  perform app.require_permission(p_entity_id, 'users.manage');

  if to_regclass('auth.users') is null then
    return null;
  end if;

  select u.id
    into v_id
    from auth.users u
   where u.email is not null
     and lower(u.email) = lower(btrim(coalesce(p_email, '')))
   limit 1;

  return v_id;
end;
$$;

comment on function app.auth_user_id_for_email(uuid, text) is
  'Looks up auth.users by email for an administrator who already holds users.manage. Returns null when no Auth account exists.';

create or replace function app.provision_entity_user(
  p_entity_id uuid,
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role_code text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_role  uuid;
  v_taken uuid;
  v_is_owner boolean;
  v_owners integer;
begin
  perform app.require_permission(p_entity_id, 'users.manage');

  if p_user_id is null then
    raise exception 'user id is required' using errcode = 'null_value_not_allowed';
  end if;
  if p_user_id = app.system_user_id() then
    raise exception 'The system actor cannot be granted a login role';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'A valid email address is required' using errcode = 'check_violation';
  end if;
  if v_email like '%@skyjet.internal' then
    raise exception 'That address is reserved for the system actor';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'full_name is required' using errcode = 'null_value_not_allowed';
  end if;

  select r.id into v_role from app.roles r where r.code = p_role_code;
  if v_role is null then
    raise exception 'Unknown role: %', p_role_code using errcode = 'no_data_found';
  end if;

  if to_regclass('auth.users') is not null then
    if not exists (select 1 from auth.users a where a.id = p_user_id) then
      raise exception 'That person does not have an Auth account yet'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  select u.id into v_taken from app.users u where lower(u.email) = v_email;
  if v_taken is not null and v_taken is distinct from p_user_id then
    raise exception 'That email is already assigned to another user';
  end if;

  select exists (
           select 1
             from app.user_roles ur
             join app.roles r on r.id = ur.role_id
            where ur.user_id = p_user_id
              and ur.entity_id = p_entity_id
              and r.code = 'owner'
              and (ur.expires_at is null or ur.expires_at > now())
         )
    into v_is_owner;

  select count(*)::int
    into v_owners
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
    join app.users u on u.id = ur.user_id
   where ur.entity_id = p_entity_id
     and r.code = 'owner'
     and u.is_active
     and (ur.expires_at is null or ur.expires_at > now());

  if v_is_owner and v_owners = 1 and p_role_code is distinct from 'owner' then
    raise exception 'Cannot remove the last owner of this entity';
  end if;

  insert into app.users (id, email, full_name, is_active, created_by, updated_by)
  values (p_user_id, v_email, v_name, true, app.acting_user_id(), app.acting_user_id())
  on conflict (id) do update
     set email = excluded.email,
         full_name = excluded.full_name,
         is_active = true,
         updated_by = excluded.updated_by;

  delete from app.user_roles
   where user_id = p_user_id
     and entity_id = p_entity_id;

  insert into app.user_roles (user_id, entity_id, role_id, granted_by)
  values (p_user_id, p_entity_id, v_role, app.acting_user_id());

  return p_user_id;
end;
$$;

comment on function app.provision_entity_user(uuid, uuid, text, text, text) is
  'Creates or updates an application user and assigns exactly one role in the entity. Requires users.manage. Refuses to demote the last owner.';

create or replace function app.set_entity_user_active(
  p_entity_id uuid,
  p_user_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_is_owner boolean;
  v_owners integer;
begin
  perform app.require_permission(p_entity_id, 'users.manage');

  if p_user_id = app.system_user_id() then
    raise exception 'The system actor cannot be deactivated';
  end if;

  if not exists (
    select 1 from app.user_roles ur
     where ur.user_id = p_user_id and ur.entity_id = p_entity_id
  ) then
    raise exception 'That person has no role in this entity' using errcode = 'no_data_found';
  end if;

  select exists (
           select 1
             from app.user_roles ur
             join app.roles r on r.id = ur.role_id
            where ur.user_id = p_user_id
              and ur.entity_id = p_entity_id
              and r.code = 'owner'
              and (ur.expires_at is null or ur.expires_at > now())
         )
    into v_is_owner;

  select count(*)::int
    into v_owners
    from app.user_roles ur
    join app.roles r on r.id = ur.role_id
    join app.users u on u.id = ur.user_id
   where ur.entity_id = p_entity_id
     and r.code = 'owner'
     and u.is_active
     and (ur.expires_at is null or ur.expires_at > now());

  if not p_is_active and v_is_owner and v_owners = 1 then
    raise exception 'Cannot deactivate the last owner of this entity';
  end if;

  update app.users
     set is_active = p_is_active,
         updated_by = app.acting_user_id()
   where id = p_user_id;

  if not found then
    raise exception 'That person was not found' using errcode = 'no_data_found';
  end if;

  return p_user_id;
end;
$$;

comment on function app.set_entity_user_active(uuid, uuid, boolean) is
  'Activates or deactivates an application user. Requires users.manage. Refuses to deactivate the last owner.';

revoke all on function app.auth_user_id_for_email(uuid, text) from public;
revoke all on function app.provision_entity_user(uuid, uuid, text, text, text) from public;
revoke all on function app.set_entity_user_active(uuid, uuid, boolean) from public;

grant execute on function app.auth_user_id_for_email(uuid, text) to skyjet_app;
grant execute on function app.provision_entity_user(uuid, uuid, text, text, text) to skyjet_app;
grant execute on function app.set_entity_user_active(uuid, uuid, boolean) to skyjet_app;
