-- ===========================================================================
-- _harness.sql
--
-- A very small assertion library, installed by the test runner before any
-- suite runs.
--
-- Why not pgTAP: the invariants worth testing here are database behaviours -
-- deferred constraint triggers firing at commit, privilege grants, row level
-- security, exception messages - which have to be exercised in SQL. pgTAP does
-- that well, but it cannot be loaded into the WebAssembly Postgres a developer
-- uses when Docker is not available, which would leave the suite runnable only
-- in CI. A suite that cannot be run while writing the code it tests does not
-- get run. Forty lines of plpgsql buys the same assertions everywhere.
--
-- Each suite runs inside a transaction the runner rolls back afterwards, so
-- tests never see each other's data and the seeded configuration is intact for
-- every one of them.
-- ===========================================================================

create schema if not exists test;

create table if not exists test.results (
  id      bigint generated always as identity primary key,
  suite   text    not null,
  name    text    not null,
  passed  boolean not null,
  detail  text
);

create or replace function test.record(
  p_suite  text,
  p_name   text,
  p_passed boolean,
  p_detail text default null
)
returns void
language sql
as $$
  insert into test.results (suite, name, passed, detail)
  values (p_suite, p_name, p_passed, p_detail);
$$;

create or replace function test.ok(
  p_suite     text,
  p_name      text,
  p_condition boolean,
  p_detail    text default null
)
returns void
language sql
as $$
  select test.record(p_suite, p_name, coalesce(p_condition, false), p_detail);
$$;

create or replace function test.eq(
  p_suite    text,
  p_name     text,
  p_actual   anyelement,
  p_expected anyelement
)
returns void
language sql
as $$
  select test.record(
    p_suite,
    p_name,
    p_actual is not distinct from p_expected,
    case
      when p_actual is not distinct from p_expected then null
      else format('expected %s, got %s', coalesce(p_expected::text, 'null'), coalesce(p_actual::text, 'null'))
    end
  );
$$;

-- Numeric comparison, separate from test.eq because a value of a domain type
-- such as app.money_amount and a plain numeric literal are not the same type
-- as far as polymorphic resolution is concerned, and every monetary assertion
-- in this suite mixes the two.
create or replace function test.eq_num(
  p_suite    text,
  p_name     text,
  p_actual   numeric,
  p_expected numeric
)
returns void
language sql
as $$
  select test.record(
    p_suite,
    p_name,
    p_actual is not distinct from p_expected,
    case
      when p_actual is not distinct from p_expected then null
      else format('expected %s, got %s', coalesce(p_expected::text, 'null'), coalesce(p_actual::text, 'null'))
    end
  );
$$;

-- Asserts that a statement is refused, optionally checking the message says
-- why. A guard that fires for the wrong reason is not a working guard.
create or replace function test.throws(
  p_suite  text,
  p_name   text,
  p_sql    text,
  p_expect text default null
)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
  exception when others then
    v_message := sqlerrm;
  end;

  if v_message is null then
    perform test.record(p_suite, p_name, false, 'the statement succeeded but should have been refused');
  elsif p_expect is not null and position(lower(p_expect) in lower(v_message)) = 0 then
    perform test.record(p_suite, p_name, false,
      format('refused, but for the wrong reason. Expected a message containing %L, got: %s', p_expect, v_message));
  else
    perform test.record(p_suite, p_name, true, v_message);
  end if;
end;
$$;

-- As above, but forces deferred constraint triggers to fire before deciding.
-- The balance check is deferred to commit, and a test cannot commit.
create or replace function test.throws_at_commit(
  p_suite  text,
  p_name   text,
  p_sql    text,
  p_expect text default null
)
returns void
language plpgsql
as $$
declare
  v_message text;
begin
  begin
    execute p_sql;
    set constraints all immediate;
    set constraints all deferred;
  exception when others then
    v_message := sqlerrm;
  end;

  if v_message is null then
    perform test.record(p_suite, p_name, false,
      'the statement survived to commit but should have been refused');
  elsif p_expect is not null and position(lower(p_expect) in lower(v_message)) = 0 then
    perform test.record(p_suite, p_name, false,
      format('refused, but for the wrong reason. Expected a message containing %L, got: %s', p_expect, v_message));
  else
    perform test.record(p_suite, p_name, true, v_message);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures resolved from the seeded configuration
-- ---------------------------------------------------------------------------

create or replace function test.entity()
returns uuid
language sql
stable
as $$
  select id from app.entities where code = 'SKYJET';
$$;

create or replace function test.account(p_code text)
returns uuid
language sql
stable
as $$
  select id from gl.accounts where entity_id = test.entity() and code = p_code;
$$;

create or replace function test.warehouse(p_code text)
returns uuid
language sql
stable
as $$
  select id from inv.warehouses where entity_id = test.entity() and code = p_code;
$$;

-- A date guaranteed to fall in an open period.
create or replace function test.open_date()
returns date
language sql
stable
as $$
  select greatest(p.start_date, least(current_date, p.end_date))
    from gl.fiscal_periods p
   where p.entity_id = test.entity()
     and p.status = 'OPEN'
   order by p.start_date desc
   limit 1;
$$;

create or replace function test.open_period()
returns uuid
language sql
stable
as $$
  select p.id
    from gl.fiscal_periods p
   where p.entity_id = test.entity()
     and p.status = 'OPEN'
   order by p.start_date desc
   limit 1;
$$;

-- A simple balanced entry, used wherever a test needs the ledger to have
-- something in it.
create or replace function test.post_simple_entry(
  p_debit_code  text,
  p_credit_code text,
  p_amount      numeric,
  p_description text default 'Test entry',
  p_date        date default null,
  p_idempotency text default null
)
returns uuid
language sql
as $$
  select gl.post_entry(
    test.entity(),
    jsonb_build_object(
      'entry_date',  coalesce(p_date, test.open_date()),
      'source_type', 'MANUAL',
      'description', p_description,
      'lines', jsonb_build_array(
        jsonb_build_object('account_code', p_debit_code, 'debit', p_amount, 'credit', 0),
        jsonb_build_object('account_code', p_credit_code, 'debit', 0, 'credit', p_amount)
      )
    ),
    p_idempotency
  );
$$;
