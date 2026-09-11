-- ===========================================================================
-- Team: employee records
--
-- An employee is someone the business employs. A user is someone who signs
-- into this system. They are deliberately separate tables: most employees
-- never get a login, some logins (an external accountant) are not employees,
-- and an employee who leaves keeps their record long after their access is
-- revoked. Nothing here touches auth.users or app.users.
--
-- The record holds personal data — date of birth, government ID, home
-- address — so read is its own permission rather than something every role
-- picks up with masters.read.
-- ===========================================================================

set search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into app.permissions (code, domain, description, is_sensitive) values
  ('team.employee.read',   'team', 'View employee records and their personal details', true),
  ('team.employee.manage', 'team', 'Create and amend employee records', true)
on conflict (code) do nothing;

-- Owner and super_admin hold every permission by construction; the invariant
-- suite asserts it, so a new code has to be granted to them here.
insert into app.role_permissions (role_id, permission_code)
select r.id, p.code
  from app.roles r
  cross join (values ('team.employee.read'), ('team.employee.manage')) as p(code)
 where r.code in ('owner', 'super_admin', 'manager')
on conflict do nothing;

insert into app.role_permissions (role_id, permission_code)
select r.id, 'team.employee.read'
  from app.roles r
 where r.code = 'accountant'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The record
-- ---------------------------------------------------------------------------

create table if not exists app.employees (
  id                             uuid primary key default gen_random_uuid(),
  entity_id                      uuid not null references app.entities (id) on delete restrict,
  employee_no                    text,
  display_name                   text not null,
  legal_name                     text not null,
  preferred_first_name           text,
  email                          text,
  phone                          text,
  home_address                   text,
  birth_date                     date,
  gender                         text,
  government_id                  text,
  status                         text not null default 'ACTIVE',
  hire_date                      date,
  release_date                   date,
  manager_id                     uuid references app.employees (id) on delete set null,
  department                     text,
  job_title                      text,
  billing_rate                   app.money_amount,
  emergency_contact_name         text,
  emergency_contact_relationship text,
  emergency_contact_phone        text,
  emergency_contact_email        text,
  notes                          text,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  created_by                     uuid,
  updated_by                     uuid,
  constraint employees_status_chk
    check (status in ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED')),
  constraint employees_gender_chk
    check (gender is null or gender in ('FEMALE', 'MALE', 'PREFER_NOT_TO_SAY')),
  constraint employees_billing_rate_chk
    check (billing_rate is null or billing_rate >= 0),
  constraint employees_dates_chk
    check (release_date is null or hire_date is null or release_date >= hire_date),
  constraint employees_manager_not_self
    check (manager_id is null or manager_id <> id),
  constraint employees_no_uq unique (entity_id, employee_no),
  constraint employees_email_uq unique (entity_id, email)
);

comment on table app.employees is
  'People the business employs. Separate from app.users, which is who can sign in.';
comment on column app.employees.display_name is
  'What the employee list and every picker show. Derived from the preferred first name when one is given.';
comment on column app.employees.employee_no is
  'The payroll or personnel number. Generated per entity when left blank.';
comment on column app.employees.government_id is
  'National ID or KRA PIN. Personal data: read is gated on team.employee.read.';

create index if not exists employees_entity_name_idx
  on app.employees (entity_id, display_name);
create index if not exists employees_entity_status_idx
  on app.employees (entity_id, status);
create index if not exists employees_manager_idx
  on app.employees (manager_id) where manager_id is not null;

select app.enable_updated_at('app.employees');
select app.enable_audit('app.employees');
select app.enforce_rls_everywhere();
select app.apply_entity_read_policy('app.employees'::regclass);

-- Reads come from the policy above. Every write goes through the functions
-- below, which run as the owner, so the application role gets no DML here.
grant select on app.employees to skyjet_app, authenticated;

-- ---------------------------------------------------------------------------
-- Create and amend
-- ---------------------------------------------------------------------------

create or replace function app.save_employee(p_entity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id        uuid := nullif(p_payload ->> 'employee_id', '')::uuid;
  v_legal     text := btrim(coalesce(p_payload ->> 'legal_name', ''));
  v_preferred text := nullif(btrim(coalesce(p_payload ->> 'preferred_first_name', '')), '');
  v_display   text := nullif(btrim(coalesce(p_payload ->> 'display_name', '')), '');
  v_email     text := lower(nullif(btrim(coalesce(p_payload ->> 'email', '')), ''));
  v_status    text := coalesce(nullif(p_payload ->> 'status', ''), 'ACTIVE');
  v_gender    text := nullif(p_payload ->> 'gender', '');
  v_manager   uuid := nullif(p_payload ->> 'manager_id', '')::uuid;
  v_no        text := nullif(btrim(coalesce(p_payload ->> 'employee_no', '')), '');
  v_space     integer;
  v_seq       integer;
begin
  perform app.require_permission(p_entity_id, 'team.employee.manage');

  if char_length(v_legal) < 2 then
    raise exception 'A legal name is required' using errcode = 'null_value_not_allowed';
  end if;

  if v_status not in ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED') then
    raise exception 'Unknown employee status %', v_status using errcode = 'check_violation';
  end if;

  if v_gender is not null and v_gender not in ('FEMALE', 'MALE', 'PREFER_NOT_TO_SAY') then
    raise exception 'Unknown gender %', v_gender using errcode = 'check_violation';
  end if;

  if v_email is not null and position('@' in v_email) = 0 then
    raise exception 'That email address is not valid' using errcode = 'check_violation';
  end if;

  -- "Lisa Safari" from "Lisa Anne Safari" reads better in a list than the full
  -- legal name, which is what payroll needs and nobody else does. The guess is
  -- only a default: display_name is an editable field.
  if v_display is null then
    v_space := position(' ' in v_legal);
    if v_preferred is not null and v_space > 0 then
      v_display := v_preferred || ' ' || regexp_replace(v_legal, '^.*\s', '');
    else
      v_display := coalesce(v_preferred, v_legal);
    end if;
  end if;

  if v_manager is not null then
    if v_manager = v_id then
      raise exception 'An employee cannot report to themselves' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from app.employees e where e.id = v_manager and e.entity_id = p_entity_id
    ) then
      raise exception 'That manager is not an employee of this entity'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  if v_email is not null and exists (
    select 1 from app.employees e
     where e.entity_id = p_entity_id
       and e.email = v_email
       and (v_id is null or e.id <> v_id)
  ) then
    raise exception 'Another employee already uses %', v_email using errcode = 'unique_violation';
  end if;

  if v_no is null and v_id is null then
    select coalesce(max(nullif(regexp_replace(e.employee_no, '\D', '', 'g'), '')::integer), 0) + 1
      into v_seq
      from app.employees e
     where e.entity_id = p_entity_id
       and e.employee_no ~ '^EMP-\d+$';
    v_no := 'EMP-' || lpad(v_seq::text, 4, '0');
  end if;

  if v_no is not null and exists (
    select 1 from app.employees e
     where e.entity_id = p_entity_id
       and e.employee_no = v_no
       and (v_id is null or e.id <> v_id)
  ) then
    raise exception 'Another employee already uses the number %', v_no
      using errcode = 'unique_violation';
  end if;

  if v_id is not null then
    update app.employees
       set employee_no                    = coalesce(v_no, employee_no),
           display_name                   = v_display,
           legal_name                     = v_legal,
           preferred_first_name           = v_preferred,
           email                          = v_email,
           phone                          = nullif(btrim(coalesce(p_payload ->> 'phone', '')), ''),
           home_address                   = nullif(btrim(coalesce(p_payload ->> 'home_address', '')), ''),
           birth_date                     = nullif(p_payload ->> 'birth_date', '')::date,
           gender                         = v_gender,
           government_id                  = nullif(btrim(coalesce(p_payload ->> 'government_id', '')), ''),
           status                         = v_status,
           hire_date                      = nullif(p_payload ->> 'hire_date', '')::date,
           release_date                   = nullif(p_payload ->> 'release_date', '')::date,
           manager_id                     = v_manager,
           department                     = nullif(btrim(coalesce(p_payload ->> 'department', '')), ''),
           job_title                      = nullif(btrim(coalesce(p_payload ->> 'job_title', '')), ''),
           billing_rate                   = nullif(p_payload ->> 'billing_rate', '')::app.money_amount,
           emergency_contact_name         = nullif(btrim(coalesce(p_payload ->> 'emergency_contact_name', '')), ''),
           emergency_contact_relationship = nullif(btrim(coalesce(p_payload ->> 'emergency_contact_relationship', '')), ''),
           emergency_contact_phone        = nullif(btrim(coalesce(p_payload ->> 'emergency_contact_phone', '')), ''),
           emergency_contact_email        = nullif(btrim(coalesce(p_payload ->> 'emergency_contact_email', '')), ''),
           notes                          = nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
           updated_by                     = app.acting_user_id()
     where id = v_id and entity_id = p_entity_id;

    if not found then
      raise exception 'That employee was not found' using errcode = 'no_data_found';
    end if;
    return v_id;
  end if;

  insert into app.employees (
    entity_id, employee_no, display_name, legal_name, preferred_first_name,
    email, phone, home_address, birth_date, gender, government_id,
    status, hire_date, release_date, manager_id, department, job_title, billing_rate,
    emergency_contact_name, emergency_contact_relationship,
    emergency_contact_phone, emergency_contact_email, notes,
    created_by, updated_by
  ) values (
    p_entity_id, v_no, v_display, v_legal, v_preferred,
    v_email,
    nullif(btrim(coalesce(p_payload ->> 'phone', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'home_address', '')), ''),
    nullif(p_payload ->> 'birth_date', '')::date,
    v_gender,
    nullif(btrim(coalesce(p_payload ->> 'government_id', '')), ''),
    v_status,
    nullif(p_payload ->> 'hire_date', '')::date,
    nullif(p_payload ->> 'release_date', '')::date,
    v_manager,
    nullif(btrim(coalesce(p_payload ->> 'department', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'job_title', '')), ''),
    nullif(p_payload ->> 'billing_rate', '')::app.money_amount,
    nullif(btrim(coalesce(p_payload ->> 'emergency_contact_name', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'emergency_contact_relationship', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'emergency_contact_phone', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'emergency_contact_email', '')), ''),
    nullif(btrim(coalesce(p_payload ->> 'notes', '')), ''),
    app.acting_user_id(), app.acting_user_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function app.save_employee(uuid, jsonb) is
  'Creates or amends an employee. Requires team.employee.manage. Numbers a new record EMP-0001 when none is supplied.';

create or replace function app.set_employee_status(
  p_entity_id   uuid,
  p_employee_id uuid,
  p_status      text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  perform app.require_permission(p_entity_id, 'team.employee.manage');

  if p_status not in ('ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED') then
    raise exception 'Unknown employee status %', p_status using errcode = 'check_violation';
  end if;

  update app.employees
     set status = p_status,
         -- Reinstating someone clears the leaving date; the record would
         -- otherwise read as active and released on the same screen.
         release_date = case when p_status = 'ACTIVE' then null else release_date end,
         updated_by = app.acting_user_id()
   where id = p_employee_id and entity_id = p_entity_id;

  if not found then
    raise exception 'That employee was not found' using errcode = 'no_data_found';
  end if;

  -- Employment ended and nobody said when: today is the honest answer.
  update app.employees
     set release_date = current_date
   where id = p_employee_id
     and entity_id = p_entity_id
     and p_status = 'TERMINATED'
     and release_date is null;

  return p_employee_id;
end;
$$;

comment on function app.set_employee_status(uuid, uuid, text) is
  'Changes an employee status. Requires team.employee.manage. Records a leaving date when employment ends.';

revoke all on function app.save_employee(uuid, jsonb) from public;
revoke all on function app.set_employee_status(uuid, uuid, text) from public;

grant execute on function
  app.save_employee(uuid, jsonb),
  app.set_employee_status(uuid, uuid, text)
to skyjet_app;
