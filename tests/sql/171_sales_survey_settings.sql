-- ===========================================================================
-- Post-invoice survey settings (defaults off) and customer reviews
-- ===========================================================================

do $$
declare
  v_suite    text := 'sales survey settings';
  v_entity   uuid := test.entity();
  v_actor    uuid := app.system_user_id();
  v_customer uuid;
  v_settings jsonb;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  v_settings := app.get_sales_survey_settings(v_entity);
  perform test.ok(v_suite, 'reviews are off when nothing has been saved',
    coalesce((v_settings ->> 'ask_review')::boolean, true) is false);
  perform test.ok(v_suite, 'work requests are off by default',
    coalesce((v_settings ->> 'ask_work_request')::boolean, true) is false);
  perform test.ok(v_suite, 'referrals are off by default',
    coalesce((v_settings ->> 'ask_referral')::boolean, true) is false);
  perform test.eq_num(v_suite, 'survey frequency defaults to 90 days',
    (v_settings ->> 'frequency_days')::integer, 90);

  v_settings := app.save_sales_survey_settings(v_entity, jsonb_build_object(
    'ask_review', true,
    'ask_work_request', false,
    'ask_referral', true,
    'frequency_days', 30
  ));
  perform test.ok(v_suite, 'saving turns the reviews question on',
    (v_settings ->> 'ask_review')::boolean);
  perform test.ok(v_suite, 'work requests stay off unless asked for',
    (v_settings ->> 'ask_work_request')::boolean is false);
  perform test.ok(v_suite, 'referrals can be turned on independently',
    (v_settings ->> 'ask_referral')::boolean);
  perform test.eq_num(v_suite, 'frequency is saved',
    (v_settings ->> 'frequency_days')::integer, 30);
  perform test.ok(v_suite, 'a settings row exists only after the first save',
    exists (select 1 from app.sales_survey_settings where entity_id = v_entity));

  perform test.throws(
    v_suite,
    'an unknown survey interval is refused',
    format(
      $q$select app.save_sales_survey_settings(%L::uuid, '{"frequency_days":7}'::jsonb)$q$,
      v_entity
    ),
    'frequency_days'
  );

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'REV-CUST',
    'legal_name', 'Review Customer Ltd',
    'currency_code', 'KES'
  ));

  insert into sales.customer_reviews (entity_id, customer_id, rating, comment)
  values (v_entity, v_customer, 5, 'Prompt delivery.');

  perform test.eq_num(v_suite, 'a submitted review is stored',
    (select count(*) from sales.customer_reviews where entity_id = v_entity), 1);

  perform test.throws(
    v_suite,
    'a rating outside 1-5 is refused',
    format(
      $q$insert into sales.customer_reviews (entity_id, customer_id, rating)
         values (%L::uuid, %L::uuid, 6)$q$,
      v_entity, v_customer
    ),
    'rating'
  );

  perform set_config('app.force_unprivileged', 'on', true);
  perform set_config('app.current_user_id', '', true);
  perform test.throws(
    v_suite,
    'saving survey settings without a caller is refused',
    format(
      $q$select app.save_sales_survey_settings(%L::uuid, '{"ask_review":true}'::jsonb)$q$,
      v_entity
    ),
    'permission denied'
  );
  perform set_config('app.force_unprivileged', '', true);
  perform set_config('app.current_user_id', v_actor::text, true);
end;
$$;
