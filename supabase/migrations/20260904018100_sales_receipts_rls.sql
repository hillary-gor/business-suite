-- Enable RLS on tables introduced by 20260904018000 (hosted DBs already applied
-- that migration before enforce_rls_everywhere was added to it).

select app.enforce_rls_everywhere();

select app.apply_entity_read_policy(t) from (values
  ('app.document_layout_settings'::regclass),
  ('sales.sales_receipts'::regclass),
  ('sales.sales_receipt_lines'::regclass)
) as v(t);
