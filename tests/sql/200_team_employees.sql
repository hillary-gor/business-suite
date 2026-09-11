-- ===========================================================================
-- Employee records (Team)
-- ===========================================================================

do $$
declare
  v_suite   text := 'team employees';
  v_entity  uuid := test.entity();
  v_lisa    uuid;
  v_peru    uuid;
  v_text    text;
  v_date    date;
begin
  perform set_config('app.current_user_id', app.system_user_id()::text, true);

  v_lisa := app.save_employee(v_entity, jsonb_build_object(
    'legal_name', 'Lisa Anne Safari',
    'preferred_first_name', 'Lisa',
    'email', 'Lisa.Safari@skyjet.test',
    'hire_date', '2026-03-06',
    'job_title', 'Stores supervisor'
  ));

  select display_name into v_text from app.employees where id = v_lisa;
  perform test.eq(v_suite, 'the display name uses the preferred first name',
    v_text, 'Lisa Safari');

  select email into v_text from app.employees where id = v_lisa;
  perform test.eq(v_suite, 'the email address is stored folded to lower case',
    v_text, 'lisa.safari@skyjet.test');

  select employee_no into v_text from app.employees where id = v_lisa;
  perform test.eq(v_suite, 'a new employee is numbered when none is supplied',
    v_text, 'EMP-0001');

  v_peru := app.save_employee(v_entity, jsonb_build_object(
    'legal_name', 'Peru Skyjet',
    'email', 'areaone26@skyjet.test',
    'manager_id', v_lisa
  ));

  select employee_no into v_text from app.employees where id = v_peru;
  perform test.eq(v_suite, 'the next number continues the sequence', v_text, 'EMP-0002');

  select display_name into v_text from app.employees where id = v_peru;
  perform test.eq(v_suite, 'the display name falls back to the legal name',
    v_text, 'Peru Skyjet');

  perform test.throws(
    v_suite,
    'two employees cannot share an email address',
    format(
      'select app.save_employee(%L::uuid, %L::jsonb)',
      v_entity,
      jsonb_build_object('legal_name', 'Someone Else', 'email', 'lisa.safari@skyjet.test')
    ),
    'already uses'
  );

  perform test.throws(
    v_suite,
    'an employee cannot report to themselves',
    format(
      'select app.save_employee(%L::uuid, %L::jsonb)',
      v_entity,
      jsonb_build_object('employee_id', v_lisa, 'legal_name', 'Lisa Anne Safari', 'manager_id', v_lisa)
    ),
    'report to themselves'
  );

  perform test.throws(
    v_suite,
    'a manager from outside the entity is refused',
    format(
      'select app.save_employee(%L::uuid, %L::jsonb)',
      v_entity,
      jsonb_build_object('legal_name', 'Third Person', 'manager_id', gen_random_uuid())
    ),
    'not an employee of this entity'
  );

  perform test.throws(
    v_suite,
    'an unknown status is refused',
    format(
      'select app.save_employee(%L::uuid, %L::jsonb)',
      v_entity,
      jsonb_build_object('legal_name', 'Fourth Person', 'status', 'RETIRED')
    ),
    'unknown employee status'
  );

  -- Ending employment records when it ended; reinstating clears it, because a
  -- record that reads active and released at once is a record nobody trusts.
  perform app.set_employee_status(v_entity, v_peru, 'TERMINATED');
  select release_date into v_date from app.employees where id = v_peru;
  perform test.eq(v_suite, 'ending employment records the leaving date',
    v_date, current_date);

  perform app.set_employee_status(v_entity, v_peru, 'ACTIVE');
  select release_date into v_date from app.employees where id = v_peru;
  perform test.ok(v_suite, 'reinstating clears the leaving date', v_date is null);

  perform test.ok(v_suite, 'creating an employee writes an audit row',
    exists (
      select 1 from audit.log
       where table_name = 'employees' and record_id = v_lisa::text and operation = 'I'
    ));

  perform test.ok(v_suite, 'the application role cannot write the table directly',
    not has_table_privilege('skyjet_app', 'app.employees', 'INSERT'));

  perform test.ok(v_suite, 'the browser role cannot write it either',
    not has_table_privilege('authenticated', 'app.employees', 'INSERT'));

  perform set_config('app.force_unprivileged', 'on', true);
  perform test.throws(
    v_suite,
    'saving without team.employee.manage is refused',
    format(
      'select app.save_employee(%L::uuid, %L::jsonb)',
      v_entity, jsonb_build_object('legal_name', 'Fifth Person')
    ),
    'permission denied'
  );
  perform test.throws(
    v_suite,
    'changing status without team.employee.manage is refused',
    format(
      'select app.set_employee_status(%L::uuid, %L::uuid, %L)',
      v_entity, v_lisa, 'INACTIVE'
    ),
    'permission denied'
  );
  perform set_config('app.force_unprivileged', '', true);
end;
$$;
