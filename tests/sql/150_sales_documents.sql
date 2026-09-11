-- ===========================================================================
-- Sales documents: credit notes and quotation → invoice conversion
-- ===========================================================================

do $$
declare
  v_suite     text := 'sales documents';
  v_entity    uuid := test.entity();
  v_actor     uuid := app.system_user_id();
  v_customer  uuid;
  v_invoice   uuid;
  v_quote     uuid;
  v_converted uuid;
  v_credit    uuid;
  v_entry     uuid;
  v_tax       uuid;
  v_ar        numeric;
  v_rev       numeric;
  v_vat       numeric;
  v_outstanding numeric;
  v_stmt      jsonb;
begin
  perform set_config('app.current_user_id', v_actor::text, true);

  select id into v_tax from app.tax_codes where entity_id = v_entity and code = 'VAT16';

  v_customer := app.save_customer(v_entity, jsonb_build_object(
    'code', 'STMT-CUST',
    'legal_name', 'Statement Airways Ltd',
    'currency_code', 'KES'
  ));

  -- -------------------------------------------------------------------------
  -- Quotation → convert to draft invoice
  -- -------------------------------------------------------------------------

  v_quote := sales.save_quotation(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'quotation_date', test.open_date(),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Quoted overhaul labour',
        'quantity', 1,
        'unit_price', 5000,
        'tax_code_id', v_tax
      )
    )
  ));

  perform test.eq_num(v_suite, 'quotation subtotal is quantity times price',
    (select subtotal from sales.quotations where id = v_quote), 5000);
  perform test.eq(v_suite, 'quotation starts as draft',
    (select status::text from sales.quotations where id = v_quote), 'DRAFT');

  perform test.throws(v_suite, 'a draft quotation cannot be marked sent by update',
    format('update sales.quotations set status = %L where id = %L', 'SENT', v_quote),
    'document status');

  perform sales.send_quotation(v_quote);
  perform test.ok(v_suite, 'sending allocates a quotation number',
    (select quotation_no from sales.quotations where id = v_quote) is not null);
  perform test.eq(v_suite, 'quotation is sent',
    (select status::text from sales.quotations where id = v_quote), 'SENT');

  v_converted := sales.convert_quotation_to_invoice(v_quote);

  perform test.ok(v_suite, 'convert creates an invoice', v_converted is not null);
  perform test.eq(v_suite, 'converted quotation is accepted',
    (select status::text from sales.quotations where id = v_quote), 'ACCEPTED');
  perform test.eq(v_suite, 'quotation points at the invoice',
    (select converted_invoice_id from sales.quotations where id = v_quote)::text,
    v_converted::text);
  perform test.eq_num(v_suite, 'converted invoice total matches the quote',
    (select total from sales.invoices where id = v_converted), 5800);
  perform test.eq(v_suite, 'converted invoice remains a draft',
    (select status::text from sales.invoices where id = v_converted), 'DRAFT');

  -- -------------------------------------------------------------------------
  -- Credit note against an issued invoice
  -- -------------------------------------------------------------------------

  v_invoice := sales.save_invoice(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'invoice_date', test.open_date(),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Labour to credit',
        'quantity', 1,
        'unit_price', 10000,
        'tax_code_id', v_tax
      )
    )
  ));
  perform sales.issue_invoice(v_invoice);

  select outstanding into v_outstanding from sales.v_invoice_balances where id = v_invoice;
  perform test.eq_num(v_suite, 'issued invoice is fully outstanding', v_outstanding, 11600);

  v_credit := sales.save_credit_note(v_entity, jsonb_build_object(
    'customer_id', v_customer,
    'credit_date', test.open_date(),
    'lines', jsonb_build_array(
      jsonb_build_object(
        'description', 'Partial credit',
        'quantity', 1,
        'unit_price', 2500,
        'tax_code_id', v_tax
      )
    ),
    'allocations', jsonb_build_array(
      jsonb_build_object('invoice_id', v_invoice, 'amount', 2900)
    )
  ));

  perform test.eq_num(v_suite, 'credit note total includes VAT',
    (select total from sales.credit_notes where id = v_credit), 2900);

  perform test.throws(v_suite, 'a draft credit note cannot be posted by updating status',
    format('update sales.credit_notes set status = %L where id = %L', 'POSTED', v_credit),
    'document status');

  v_entry := sales.post_credit_note(v_credit);

  perform test.ok(v_suite, 'posting allocates a credit note number',
    (select credit_no from sales.credit_notes where id = v_credit) is not null);
  perform test.eq(v_suite, 'credit note is posted',
    (select status::text from sales.credit_notes where id = v_credit), 'POSTED');

  select
    coalesce(sum(case when account_id = test.account('1110') then credit_base - debit_base end), 0),
    coalesce(sum(case when account_id = test.account('4010') then debit_base - credit_base end), 0),
    coalesce(sum(case when account_id = test.account('2110') then debit_base - credit_base end), 0)
    into v_ar, v_rev, v_vat
    from gl.journal_entry_line
   where entry_id = v_entry;

  perform test.eq_num(v_suite, 'credit note credits receivables for the gross', v_ar, 2900);
  perform test.eq_num(v_suite, 'credit note debits revenue for the net', v_rev, 2500);
  perform test.eq_num(v_suite, 'credit note debits output tax', v_vat, 400);

  select outstanding into v_outstanding from sales.v_invoice_balances where id = v_invoice;
  perform test.eq_num(v_suite, 'credit allocation reduces invoice outstanding', v_outstanding, 8700);

  -- -------------------------------------------------------------------------
  -- Customer statement
  -- -------------------------------------------------------------------------

  v_stmt := sales.customer_statement(v_entity, v_customer, test.open_date());

  perform test.ok(v_suite, 'statement returns open invoices',
    jsonb_array_length(v_stmt -> 'open_invoices') >= 1);
  perform test.ok(v_suite, 'statement returns recent activity',
    jsonb_array_length(v_stmt -> 'recent_activity') >= 1);
end;
$$;
