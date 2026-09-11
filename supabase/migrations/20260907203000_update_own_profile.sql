-- A signed-in person may amend their own name, job title and phone.
-- Email, activity and break-glass flags stay out of this path.

set search_path = pg_catalog, public, extensions;

create or replace function app.update_own_profile(
  p_full_name text,
  p_job_title text,
  p_phone     text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user  uuid := app.current_user_id();
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_title text := nullif(btrim(coalesce(p_job_title, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  if v_user is null then
    raise exception
      'No acting user in session context. The application must set app.current_user_id before writing.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_user = app.system_user_id() then
    raise exception 'The system actor cannot have a login profile';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'full_name is required' using errcode = 'null_value_not_allowed';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'full_name is too long' using errcode = 'check_violation';
  end if;
  if v_title is not null and char_length(v_title) > 120 then
    raise exception 'job_title is too long' using errcode = 'check_violation';
  end if;
  if v_phone is not null and char_length(v_phone) > 40 then
    raise exception 'phone is too long' using errcode = 'check_violation';
  end if;

  update app.users
     set full_name  = v_name,
         job_title  = v_title,
         phone      = v_phone,
         updated_by = v_user
   where id = v_user
     and is_active;

  if not found then
    raise exception 'Your account was not found' using errcode = 'no_data_found';
  end if;

  return v_user;
end;
$$;

comment on function app.update_own_profile(text, text, text) is
  'Updates the acting user’s display name, job title and phone. Does not change email, activity or is_superuser.';

revoke all on function app.update_own_profile(text, text, text)
  from public, anon, authenticated;

grant execute on function app.update_own_profile(text, text, text) to skyjet_app;
