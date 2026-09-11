-- Post-invoice / feedback survey preferences, and a table for customer
-- reviews when that question is turned on. The questions stay off until an
-- operator saves them in Sales settings. Collecting replies after an invoice
-- is a later path; this migration only stores the preference and the reviews
-- that would result.

set search_path = pg_catalog, public, extensions;

create table app.sales_survey_settings (
  entity_id          uuid primary key references app.entities (id) on delete restrict,
  ask_work_request   boolean not null default false,
  ask_review         boolean not null default false,
  ask_referral       boolean not null default false,
  frequency_days     integer not null default 90
                     check (frequency_days in (30, 60, 90, 180)),
  updated_at         timestamptz not null default now(),
  updated_by         uuid
);

comment on table app.sales_survey_settings is
  'Per-entity post-invoice survey toggles. Missing row means every question is off and the interval is 90 days.';

select app.enable_updated_at('app.sales_survey_settings');
select app.apply_entity_read_policy('app.sales_survey_settings'::regclass);

grant select on app.sales_survey_settings to skyjet_app, authenticated;

create or replace function app.get_sales_survey_settings(p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_row app.sales_survey_settings%rowtype;
begin
  select * into v_row
    from app.sales_survey_settings
   where entity_id = p_entity_id;

  return jsonb_build_object(
    'ask_work_request', coalesce(v_row.ask_work_request, false),
    'ask_review',       coalesce(v_row.ask_review, false),
    'ask_referral',     coalesce(v_row.ask_referral, false),
    'frequency_days',   coalesce(v_row.frequency_days, 90)
  );
end;
$$;

create or replace function app.save_sales_survey_settings(
  p_entity_id uuid,
  p_payload   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_work    boolean;
  v_review  boolean;
  v_referral boolean;
  v_freq    integer;
begin
  perform app.require_permission(p_entity_id, 'settings.manage');

  v_work := coalesce((v_payload ->> 'ask_work_request')::boolean, false);
  v_review := coalesce((v_payload ->> 'ask_review')::boolean, false);
  v_referral := coalesce((v_payload ->> 'ask_referral')::boolean, false);
  v_freq := coalesce((v_payload ->> 'frequency_days')::integer, 90);

  if v_freq not in (30, 60, 90, 180) then
    raise exception 'frequency_days must be 30, 60, 90 or 180'
      using errcode = 'check_violation';
  end if;

  insert into app.sales_survey_settings (
    entity_id, ask_work_request, ask_review, ask_referral, frequency_days, updated_by
  )
  values (
    p_entity_id, v_work, v_review, v_referral, v_freq, app.acting_user_id()
  )
  on conflict (entity_id) do update
    set ask_work_request = excluded.ask_work_request,
        ask_review = excluded.ask_review,
        ask_referral = excluded.ask_referral,
        frequency_days = excluded.frequency_days,
        updated_by = app.acting_user_id();

  return app.get_sales_survey_settings(p_entity_id);
end;
$$;

grant execute on function
  app.get_sales_survey_settings(uuid),
  app.save_sales_survey_settings(uuid, jsonb)
to skyjet_app;

create table sales.customer_reviews (
  id            uuid primary key default gen_random_uuid(),
  entity_id     uuid not null references app.entities (id) on delete restrict,
  customer_id   uuid not null references app.customers (id) on delete restrict,
  invoice_id    uuid references sales.invoices (id) on delete restrict,
  rating        smallint not null,
  comment       text,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  constraint customer_reviews_rating_range check (rating between 1 and 5)
);

comment on table sales.customer_reviews is
  'Star ratings and optional testimonials left after an invoice. Rows are listed on Customer Hub → Reviews when the survey question is on.';

create index customer_reviews_entity_submitted_idx
  on sales.customer_reviews (entity_id, submitted_at desc);

select app.enforce_rls_everywhere();
select app.apply_entity_read_policy('sales.customer_reviews'::regclass);

grant select on sales.customer_reviews to skyjet_app, authenticated;
