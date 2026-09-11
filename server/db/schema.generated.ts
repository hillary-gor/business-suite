/**
 * Generated from the database schema. Do not edit by hand.
 *
 * Regenerate with `npm run db:types` after changing a migration.
 *
 * NUMERIC columns are typed as `string`. That is not an oversight: a
 * JavaScript number is a double and would lose precision the moment it
 * touched a monetary value. Pass them through Money from @/lib/money.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AppAddressKind = 'BILLING' | 'SHIPPING' | 'REGISTERED' | 'WAREHOUSE';

export type AppTaxKind = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NON_VAT' | 'REVERSE_CHARGE' | 'WITHHOLDING';

export type GlAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export type GlBalanceSide = 'DEBIT' | 'CREDIT';

export type GlControlType = 'ACCOUNTS_RECEIVABLE' | 'ACCOUNTS_PAYABLE' | 'INVENTORY' | 'GOODS_RECEIVED_NOT_INVOICED' | 'BANK' | 'CASH' | 'TAX_OUTPUT' | 'TAX_INPUT' | 'RETAINED_EARNINGS' | 'FX_REALISED' | 'FX_UNREALISED' | 'ROUNDING' | 'SUSPENSE';

export type GlObStatus = 'DRAFT' | 'VALIDATED' | 'POSTED' | 'CANCELLED';

export type GlPeriodStatus = 'FUTURE' | 'OPEN' | 'CLOSED' | 'PERMANENTLY_CLOSED';

export type GlYearStatus = 'FUTURE' | 'OPEN' | 'CLOSED' | 'PERMANENTLY_CLOSED';

export type IntegrationDeliveryStatus = 'PENDING' | 'IN_FLIGHT' | 'SUCCEEDED' | 'FAILED' | 'DEAD';

export type IntegrationEtimsDocumentType = 'SALES_INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE' | 'PURCHASE_INVOICE' | 'STOCK_MOVEMENT' | 'STOCK_ADJUSTMENT';

export type IntegrationEtimsStatus = 'NOT_REQUIRED' | 'PENDING' | 'TRANSMITTED' | 'ACKNOWLEDGED' | 'REJECTED' | 'VOIDED';

export type InvBinType = 'STOCK' | 'GOODS_IN' | 'QUARANTINE' | 'PICK_FACE' | 'PACKING' | 'DESPATCH' | 'SCRAP' | 'REPAIR';

export type InvCostingMethod = 'WEIGHTED_AVERAGE' | 'SPECIFIC';

export type InvMovementType = 'OPENING' | 'RECEIPT' | 'ISSUE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'REVALUATION' | 'SCRAP' | 'CUSTOMER_RETURN' | 'SUPPLIER_RETURN';

export type InvPartNumberKind = 'ALTERNATE' | 'SUPERSEDES' | 'SUPERSEDED_BY' | 'CUSTOMER' | 'SUPPLIER' | 'NATO' | 'INTERCHANGEABLE';

export type InvStockUnitStatus = 'ON_HAND' | 'ALLOCATED' | 'PICKED' | 'IN_TRANSIT' | 'DELIVERED' | 'QUARANTINE' | 'IN_REPAIR' | 'CONSUMED' | 'SCRAPPED' | 'RETURNED';

export type InvTrackingMode = 'NONE' | 'LOT' | 'SERIAL';

export type PurchBillStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export type PurchCreditStatus = 'DRAFT' | 'POSTED';

export type PurchGrnStatus = 'DRAFT' | 'POSTED';

export type PurchPaymentStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type PurchPoStatus = 'DRAFT' | 'APPROVED' | 'CANCELLED';

export type SalesCreditNoteStatus = 'DRAFT' | 'POSTED';

export type SalesDebitNoteStatus = 'DRAFT' | 'POSTED';

export type SalesInvoiceStatus = 'DRAFT' | 'ISSUED' | 'VOIDED';

export type SalesQuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'CANCELLED';

export type SalesReceiptStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type SalesRefundStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export type SalesSalesOrderStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export type SalesSalesReceiptStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

/** app.addresses */
export interface AppAddressesRow {
  id: string;
  entity_id: string;
  kind: AppAddressKind;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppAddressesInsert {
  id?: string;
  entity_id: string;
  kind?: AppAddressKind;
  label?: string | null;
  line1: string;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.attachment_links */
export interface AppAttachmentLinksRow {
  attachment_id: string;
  record_schema: string;
  record_table: string;
  record_id: string;
  link_role: string;
  linked_at: string;
  linked_by: string | null;
}

export interface AppAttachmentLinksInsert {
  attachment_id: string;
  record_schema: string;
  record_table: string;
  record_id: string;
  link_role?: string;
  linked_at?: string;
  linked_by?: string | null;
}

/** app.attachments */
export interface AppAttachmentsRow {
  id: string;
  entity_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: string;
  sha256: string;
  kind: string;
  description: string | null;
  is_immutable: boolean;
  uploaded_at: string;
  uploaded_by: string | null;
}

export interface AppAttachmentsInsert {
  id?: string;
  entity_id: string;
  storage_bucket?: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: string;
  sha256: string;
  kind?: string;
  description?: string | null;
  is_immutable?: boolean;
  uploaded_at?: string;
  uploaded_by?: string | null;
}

/** app.contacts */
export interface AppContactsRow {
  id: string;
  entity_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppContactsInsert {
  id?: string;
  entity_id: string;
  full_name: string;
  job_title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.currencies */
export interface AppCurrenciesRow {
  code: string;
  name: string;
  symbol: string | null;
  minor_units: number;
  is_active: boolean;
}

export interface AppCurrenciesInsert {
  code: string;
  name: string;
  symbol?: string | null;
  minor_units?: number;
  is_active?: boolean;
}

/** app.customers */
export interface AppCustomersRow {
  id: string;
  entity_id: string;
  code: string;
  legal_name: string;
  trading_name: string | null;
  tax_pin: string | null;
  currency_code: string;
  payment_terms_id: string | null;
  credit_limit: string;
  is_credit_hold: boolean;
  credit_hold_reason: string | null;
  ar_account_id: string | null;
  default_tax_code_id: string | null;
  billing_address_id: string | null;
  shipping_address_id: string | null;
  primary_contact_id: string | null;
  email: string | null;
  phone: string | null;
  requires_certificate: boolean;
  customer_type: string;
  etims_customer_type: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppCustomersInsert {
  id?: string;
  entity_id: string;
  code: string;
  legal_name: string;
  trading_name?: string | null;
  tax_pin?: string | null;
  currency_code: string;
  payment_terms_id?: string | null;
  credit_limit?: string;
  is_credit_hold?: boolean;
  credit_hold_reason?: string | null;
  ar_account_id?: string | null;
  default_tax_code_id?: string | null;
  billing_address_id?: string | null;
  shipping_address_id?: string | null;
  primary_contact_id?: string | null;
  email?: string | null;
  phone?: string | null;
  requires_certificate?: boolean;
  customer_type?: string;
  etims_customer_type?: string | null;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.document_layout_settings */
export interface AppDocumentLayoutSettingsRow {
  id: string;
  entity_id: string;
  document_type: string;
  settings: unknown;
  updated_at: string;
  updated_by: string | null;
}

export interface AppDocumentLayoutSettingsInsert {
  id?: string;
  entity_id: string;
  document_type: string;
  settings?: unknown;
  updated_at?: string;
  updated_by?: string | null;
}

/** app.document_types */
export interface AppDocumentTypesRow {
  code: string;
  name: string;
  description: string;
}

export interface AppDocumentTypesInsert {
  code: string;
  name: string;
  description?: string;
}

/** app.employees */
export interface AppEmployeesRow {
  id: string;
  entity_id: string;
  employee_no: string | null;
  display_name: string;
  legal_name: string;
  preferred_first_name: string | null;
  email: string | null;
  phone: string | null;
  home_address: string | null;
  birth_date: string | null;
  gender: string | null;
  government_id: string | null;
  status: string;
  hire_date: string | null;
  release_date: string | null;
  manager_id: string | null;
  department: string | null;
  job_title: string | null;
  billing_rate: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relationship: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppEmployeesInsert {
  id?: string;
  entity_id: string;
  employee_no?: string | null;
  display_name: string;
  legal_name: string;
  preferred_first_name?: string | null;
  email?: string | null;
  phone?: string | null;
  home_address?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  government_id?: string | null;
  status?: string;
  hire_date?: string | null;
  release_date?: string | null;
  manager_id?: string | null;
  department?: string | null;
  job_title?: string | null;
  billing_rate?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_email?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.entities */
export interface AppEntitiesRow {
  id: string;
  code: string;
  legal_name: string;
  trading_name: string | null;
  tax_pin: string | null;
  registration_number: string | null;
  country_code: string;
  base_currency_code: string;
  fiscal_year_start_month: number;
  timezone: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  logo_mime: string | null;
  logo_bytes: Buffer | null;
}

export interface AppEntitiesInsert {
  id?: string;
  code: string;
  legal_name: string;
  trading_name?: string | null;
  tax_pin?: string | null;
  registration_number?: string | null;
  country_code?: string;
  base_currency_code?: string;
  fiscal_year_start_month?: number;
  timezone?: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
  updated_by?: string | null;
  logo_mime?: string | null;
  logo_bytes?: Buffer | null;
}

/** app.fx_rates */
export interface AppFxRatesRow {
  id: string;
  entity_id: string;
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate_type: string;
  rate: string;
  source: string;
  created_at: string;
  created_by: string | null;
}

export interface AppFxRatesInsert {
  id?: string;
  entity_id: string;
  from_currency: string;
  to_currency: string;
  rate_date: string;
  rate_type?: string;
  rate: string;
  source?: string;
  created_at?: string;
  created_by?: string | null;
}

/** app.idempotency_keys */
export interface AppIdempotencyKeysRow {
  entity_id: string;
  scope: string;
  idempotency_key: string;
  request_hash: string;
  status: string;
  result: unknown | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface AppIdempotencyKeysInsert {
  entity_id: string;
  scope: string;
  idempotency_key: string;
  request_hash: string;
  status?: string;
  result?: unknown | null;
  error_message?: string | null;
  created_at?: string;
  completed_at?: string | null;
  created_by?: string | null;
}

/** app.numbering_sequences */
export interface AppNumberingSequencesRow {
  id: string;
  entity_id: string;
  document_type: string;
  fiscal_year: number;
  prefix: string;
  suffix: string;
  pad_length: number;
  next_value: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppNumberingSequencesInsert {
  id?: string;
  entity_id: string;
  document_type: string;
  fiscal_year: number;
  prefix?: string;
  suffix?: string;
  pad_length?: number;
  next_value?: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.payment_terms */
export interface AppPaymentTermsRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  days_net: number;
  is_end_of_month: boolean;
  discount_days: number | null;
  discount_percent: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppPaymentTermsInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  days_net?: number;
  is_end_of_month?: boolean;
  discount_days?: number | null;
  discount_percent?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.permissions */
export interface AppPermissionsRow {
  code: string;
  domain: string;
  description: string;
  is_sensitive: boolean;
}

export interface AppPermissionsInsert {
  code: string;
  domain: string;
  description: string;
  is_sensitive?: boolean;
}

/** app.role_permissions */
export interface AppRolePermissionsRow {
  role_id: string;
  permission_code: string;
  granted_at: string;
  granted_by: string | null;
}

export interface AppRolePermissionsInsert {
  role_id: string;
  permission_code: string;
  granted_at?: string;
  granted_by?: string | null;
}

/** app.roles */
export interface AppRolesRow {
  id: string;
  code: string;
  name: string;
  description: string;
  is_system: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppRolesInsert {
  id?: string;
  code: string;
  name: string;
  description?: string;
  is_system?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.sales_survey_settings */
export interface AppSalesSurveySettingsRow {
  entity_id: string;
  ask_work_request: boolean;
  ask_review: boolean;
  ask_referral: boolean;
  frequency_days: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AppSalesSurveySettingsInsert {
  entity_id: string;
  ask_work_request?: boolean;
  ask_review?: boolean;
  ask_referral?: boolean;
  frequency_days?: number;
  updated_at?: string;
  updated_by?: string | null;
}

/** app.suppliers */
export interface AppSuppliersRow {
  id: string;
  entity_id: string;
  code: string;
  legal_name: string;
  trading_name: string | null;
  tax_pin: string | null;
  currency_code: string;
  payment_terms_id: string | null;
  ap_account_id: string | null;
  default_tax_code_id: string | null;
  remit_to_address_id: string | null;
  primary_contact_id: string | null;
  email: string | null;
  phone: string | null;
  approval_status: string;
  approval_expires_on: string | null;
  approved_at: string | null;
  approved_by: string | null;
  quality_certifications: string[] | null;
  is_foreign: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppSuppliersInsert {
  id?: string;
  entity_id: string;
  code: string;
  legal_name: string;
  trading_name?: string | null;
  tax_pin?: string | null;
  currency_code: string;
  payment_terms_id?: string | null;
  ap_account_id?: string | null;
  default_tax_code_id?: string | null;
  remit_to_address_id?: string | null;
  primary_contact_id?: string | null;
  email?: string | null;
  phone?: string | null;
  approval_status?: string;
  approval_expires_on?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  quality_certifications?: string[] | null;
  is_foreign?: boolean;
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.tax_codes */
export interface AppTaxCodesRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  kind: AppTaxKind;
  rate: string;
  is_recoverable: boolean;
  output_tax_account_id: string | null;
  input_tax_account_id: string | null;
  etims_tax_code: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  is_default_sales: boolean;
  is_default_purchase: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface AppTaxCodesInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  kind: AppTaxKind;
  rate: string;
  is_recoverable?: boolean;
  output_tax_account_id?: string | null;
  input_tax_account_id?: string | null;
  etims_tax_code?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  is_active?: boolean;
  is_default_sales?: boolean;
  is_default_purchase?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** app.user_effective_permissions (view) */
export interface AppUserEffectivePermissionsRow {
  user_id: string | null;
  entity_id: string | null;
  permission_code: string | null;
}

/** app.user_roles */
export interface AppUserRolesRow {
  user_id: string;
  entity_id: string;
  role_id: string;
  granted_at: string;
  granted_by: string | null;
  expires_at: string | null;
}

export interface AppUserRolesInsert {
  user_id: string;
  entity_id: string;
  role_id: string;
  granted_at?: string;
  granted_by?: string | null;
  expires_at?: string | null;
}

/** app.users */
export interface AppUsersRow {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  is_active: boolean;
  is_superuser: boolean;
  last_seen_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AppUsersInsert {
  id: string;
  email: string;
  full_name: string;
  job_title?: string | null;
  phone?: string | null;
  is_active?: boolean;
  is_superuser?: boolean;
  last_seen_at?: string | null;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
  updated_by?: string | null;
}

/** app.v_function_search_path (view) */
export interface AppVFunctionSearchPathRow {
  schema_name: string | null;
  function_name: string | null;
  security_definer: boolean | null;
  search_path_pinned: boolean | null;
}

/** app.v_rls_coverage (view) */
export interface AppVRlsCoverageRow {
  schema_name: string | null;
  table_name: string | null;
  rls_enabled: boolean | null;
  policy_count: number | null;
  app_role_policy_count: number | null;
  browser_policy_count: number | null;
}

/** audit.log */
export interface AuditLogRow {
  id: string;
  occurred_at: string;
  entity_id: string | null;
  actor_user_id: string | null;
  operation: string;
  schema_name: string;
  table_name: string;
  record_id: string | null;
  before_data: unknown | null;
  after_data: unknown | null;
  changed_fields: string[] | null;
  request_id: string | null;
  txid: string;
  statement_ts: string;
}

export interface AuditLogInsert {
  id: string;
  occurred_at?: string;
  entity_id?: string | null;
  actor_user_id?: string | null;
  operation: string;
  schema_name: string;
  table_name: string;
  record_id?: string | null;
  before_data?: unknown | null;
  after_data?: unknown | null;
  changed_fields?: string[] | null;
  request_id?: string | null;
  txid?: string;
  statement_ts?: string;
}

/** gl.account_balance_period */
export interface GlAccountBalancePeriodRow {
  entity_id: string;
  account_id: string;
  period_id: string;
  currency_code: string;
  debit_txn: string;
  credit_txn: string;
  debit_base: string;
  credit_base: string;
  line_count: number;
  updated_at: string;
}

export interface GlAccountBalancePeriodInsert {
  entity_id: string;
  account_id: string;
  period_id: string;
  currency_code: string;
  debit_txn?: string;
  credit_txn?: string;
  debit_base?: string;
  credit_base?: string;
  line_count?: number;
  updated_at?: string;
}

/** gl.accounts */
export interface GlAccountsRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  description: string | null;
  account_type: GlAccountType;
  normal_balance: GlBalanceSide;
  parent_id: string | null;
  is_postable: boolean;
  is_active: boolean;
  is_system: boolean;
  control_type: GlControlType | null;
  currency_code: string | null;
  requires_customer: boolean;
  requires_supplier: boolean;
  requires_warehouse: boolean;
  requires_item: boolean;
  is_reconcilable: boolean;
  is_monetary: boolean;
  is_contra: boolean;
  sort_key: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GlAccountsInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  description?: string | null;
  account_type: GlAccountType;
  normal_balance: GlBalanceSide;
  parent_id?: string | null;
  is_postable?: boolean;
  is_active?: boolean;
  is_system?: boolean;
  control_type?: GlControlType | null;
  currency_code?: string | null;
  requires_customer?: boolean;
  requires_supplier?: boolean;
  requires_warehouse?: boolean;
  requires_item?: boolean;
  is_reconcilable?: boolean;
  is_monetary?: boolean;
  is_contra?: boolean;
  sort_key?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** gl.entity_account_settings */
export interface GlEntityAccountSettingsRow {
  entity_id: string;
  setting_code: string;
  account_id: string;
  updated_at: string;
  updated_by: string | null;
}

export interface GlEntityAccountSettingsInsert {
  entity_id: string;
  setting_code: string;
  account_id: string;
  updated_at?: string;
  updated_by?: string | null;
}

/** gl.fiscal_periods */
export interface GlFiscalPeriodsRow {
  id: string;
  entity_id: string;
  fiscal_year_id: string;
  period_no: number;
  name: string;
  start_date: string;
  end_date: string;
  status: GlPeriodStatus;
  closed_at: string | null;
  closed_by: string | null;
  reopened_count: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GlFiscalPeriodsInsert {
  id?: string;
  entity_id: string;
  fiscal_year_id: string;
  period_no: number;
  name: string;
  start_date: string;
  end_date: string;
  status?: GlPeriodStatus;
  closed_at?: string | null;
  closed_by?: string | null;
  reopened_count?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** gl.fiscal_years */
export interface GlFiscalYearsRow {
  id: string;
  entity_id: string;
  code: string;
  start_date: string;
  end_date: string;
  status: GlYearStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GlFiscalYearsInsert {
  id?: string;
  entity_id: string;
  code: string;
  start_date: string;
  end_date: string;
  status?: GlYearStatus;
  closed_at?: string | null;
  closed_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** gl.fx_revaluation_position */
export interface GlFxRevaluationPositionRow {
  entity_id: string;
  account_id: string;
  currency_code: string;
  cumulative_adjustment_base: string;
  last_run_id: string | null;
  updated_at: string;
}

export interface GlFxRevaluationPositionInsert {
  entity_id: string;
  account_id: string;
  currency_code: string;
  cumulative_adjustment_base?: string;
  last_run_id?: string | null;
  updated_at?: string;
}

/** gl.fx_revaluation_run */
export interface GlFxRevaluationRunRow {
  id: string;
  entity_id: string;
  period_id: string;
  as_at: string;
  rate_type: string;
  journal_entry_id: string | null;
  net_gain_base: string;
  run_at: string;
  run_by: string;
}

export interface GlFxRevaluationRunInsert {
  id?: string;
  entity_id: string;
  period_id: string;
  as_at: string;
  rate_type?: string;
  journal_entry_id?: string | null;
  net_gain_base?: string;
  run_at?: string;
  run_by: string;
}

/** gl.journal_entry */
export interface GlJournalEntryRow {
  id: string;
  entity_id: string;
  entry_no: string;
  entry_date: string;
  period_id: string;
  source_type: string;
  source_id: string | null;
  source_document_no: string | null;
  description: string;
  memo: string | null;
  base_currency_code: string;
  total_debit_base: string;
  total_credit_base: string;
  line_count: number;
  reversal_of_entry_id: string | null;
  reversal_reason: string | null;
  idempotency_key: string | null;
  posted_at: string;
  posted_by: string;
}

export interface GlJournalEntryInsert {
  id?: string;
  entity_id: string;
  entry_no: string;
  entry_date: string;
  period_id: string;
  source_type: string;
  source_id?: string | null;
  source_document_no?: string | null;
  description: string;
  memo?: string | null;
  base_currency_code: string;
  total_debit_base: string;
  total_credit_base: string;
  line_count: number;
  reversal_of_entry_id?: string | null;
  reversal_reason?: string | null;
  idempotency_key?: string | null;
  posted_at?: string;
  posted_by: string;
}

/** gl.journal_entry_line */
export interface GlJournalEntryLineRow {
  id: string;
  entry_id: string;
  entity_id: string;
  line_no: number;
  account_id: string;
  entry_date: string;
  period_id: string;
  currency_code: string;
  fx_rate: string;
  debit_txn: string;
  credit_txn: string;
  debit_base: string;
  credit_base: string;
  memo: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  warehouse_id: string | null;
  item_id: string | null;
  stock_unit_id: string | null;
  cost_centre: string | null;
  project_code: string | null;
  created_at: string;
}

export interface GlJournalEntryLineInsert {
  id?: string;
  entry_id: string;
  entity_id: string;
  line_no: number;
  account_id: string;
  entry_date: string;
  period_id: string;
  currency_code: string;
  fx_rate?: string;
  debit_txn?: string;
  credit_txn?: string;
  debit_base?: string;
  credit_base?: string;
  memo?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  warehouse_id?: string | null;
  item_id?: string | null;
  stock_unit_id?: string | null;
  cost_centre?: string | null;
  project_code?: string | null;
  created_at?: string;
}

/** gl.journal_sources */
export interface GlJournalSourcesRow {
  code: string;
  name: string;
  is_manual: boolean;
  description: string;
}

export interface GlJournalSourcesInsert {
  code: string;
  name: string;
  is_manual?: boolean;
  description?: string;
}

/** gl.ob_ap_open_item */
export interface GlObApOpenItemRow {
  id: string;
  batch_id: string;
  supplier_code: string;
  document_no: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  amount_txn: string;
  amount_base: string;
  memo: string | null;
}

export interface GlObApOpenItemInsert {
  id?: string;
  batch_id: string;
  supplier_code: string;
  document_no: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  amount_txn: string;
  amount_base: string;
  memo?: string | null;
}

/** gl.ob_ar_open_item */
export interface GlObArOpenItemRow {
  id: string;
  batch_id: string;
  customer_code: string;
  document_no: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  amount_txn: string;
  amount_base: string;
  memo: string | null;
}

export interface GlObArOpenItemInsert {
  id?: string;
  batch_id: string;
  customer_code: string;
  document_no: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  amount_txn: string;
  amount_base: string;
  memo?: string | null;
}

/** gl.ob_batch */
export interface GlObBatchRow {
  id: string;
  entity_id: string;
  cutover_date: string;
  source_system: string;
  description: string;
  status: GlObStatus;
  journal_entry_id: string | null;
  validated_at: string | null;
  validated_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface GlObBatchInsert {
  id?: string;
  entity_id: string;
  cutover_date: string;
  source_system?: string;
  description?: string;
  status?: GlObStatus;
  journal_entry_id?: string | null;
  validated_at?: string | null;
  validated_by?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  created_at?: string;
  created_by?: string | null;
  updated_at?: string;
  updated_by?: string | null;
}

/** gl.ob_inventory_line */
export interface GlObInventoryLineRow {
  id: string;
  batch_id: string;
  part_number: string;
  warehouse_code: string;
  bin_code: string | null;
  serial_number: string | null;
  lot_number: string | null;
  condition_code: string;
  quantity: string;
  unit_cost_base: string;
  expiry_date: string | null;
  certificate_type: string | null;
  certificate_number: string | null;
  memo: string | null;
}

export interface GlObInventoryLineInsert {
  id?: string;
  batch_id: string;
  part_number: string;
  warehouse_code: string;
  bin_code?: string | null;
  serial_number?: string | null;
  lot_number?: string | null;
  condition_code?: string;
  quantity: string;
  unit_cost_base: string;
  expiry_date?: string | null;
  certificate_type?: string | null;
  certificate_number?: string | null;
  memo?: string | null;
}

/** gl.ob_trial_balance_line */
export interface GlObTrialBalanceLineRow {
  id: string;
  batch_id: string;
  line_no: number;
  account_code: string;
  currency_code: string;
  debit: string;
  credit: string;
  memo: string | null;
}

export interface GlObTrialBalanceLineInsert {
  id?: string;
  batch_id: string;
  line_no: number;
  account_code: string;
  currency_code?: string;
  debit?: string;
  credit?: string;
  memo?: string | null;
}

/** gl.period_close_snapshot */
export interface GlPeriodCloseSnapshotRow {
  id: string;
  entity_id: string;
  period_id: string;
  account_id: string;
  closing_base: string;
  period_debit: string;
  period_credit: string;
  captured_at: string;
  close_seq: number;
}

export interface GlPeriodCloseSnapshotInsert {
  id?: string;
  entity_id: string;
  period_id: string;
  account_id: string;
  closing_base: string;
  period_debit: string;
  period_credit: string;
  captured_at?: string;
  close_seq?: number;
}

/** gl.period_reopen_log */
export interface GlPeriodReopenLogRow {
  id: string;
  entity_id: string;
  period_id: string;
  reason: string;
  reopened_at: string;
  reopened_by: string;
}

export interface GlPeriodReopenLogInsert {
  id?: string;
  entity_id: string;
  period_id: string;
  reason: string;
  reopened_at?: string;
  reopened_by: string;
}

/** gl.v_journal_entry (view) */
export interface GlVJournalEntryRow {
  id: string | null;
  entity_id: string | null;
  entry_no: string | null;
  entry_date: string | null;
  period_id: string | null;
  source_type: string | null;
  source_id: string | null;
  source_document_no: string | null;
  description: string | null;
  memo: string | null;
  base_currency_code: string | null;
  total_debit_base: string | null;
  total_credit_base: string | null;
  line_count: number | null;
  reversal_of_entry_id: string | null;
  reversal_reason: string | null;
  idempotency_key: string | null;
  posted_at: string | null;
  posted_by: string | null;
  reversed_by_entry_id: string | null;
  reversed_by_entry_no: string | null;
  is_reversed: boolean | null;
  is_reversal: boolean | null;
}

/** integration.etims_device */
export interface IntegrationEtimsDeviceRow {
  id: string;
  entity_id: string;
  tax_pin: string;
  branch_id: string;
  device_serial: string;
  sdc_id: string | null;
  cmc_key: string | null;
  environment: string;
  base_url: string | null;
  last_invoice_no: string;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface IntegrationEtimsDeviceInsert {
  id?: string;
  entity_id: string;
  tax_pin: string;
  branch_id?: string;
  device_serial: string;
  sdc_id?: string | null;
  cmc_key?: string | null;
  environment?: string;
  base_url?: string | null;
  last_invoice_no?: string;
  last_sync_at?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** integration.etims_document */
export interface IntegrationEtimsDocumentRow {
  id: string;
  entity_id: string;
  device_id: string | null;
  document_type: IntegrationEtimsDocumentType;
  source_type: string;
  source_id: string;
  internal_document_no: string;
  status: IntegrationEtimsStatus;
  outbox_id: string | null;
  cu_invoice_no: string | null;
  cu_receipt_no: string | null;
  control_code: string | null;
  internal_data: string | null;
  receipt_signature: string | null;
  qr_code_url: string | null;
  sdc_datetime: string | null;
  signed_at: string | null;
  total_taxable_base: string | null;
  total_tax_base: string | null;
  total_gross_base: string | null;
  rejection_reason: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface IntegrationEtimsDocumentInsert {
  id?: string;
  entity_id: string;
  device_id?: string | null;
  document_type: IntegrationEtimsDocumentType;
  source_type: string;
  source_id: string;
  internal_document_no: string;
  status?: IntegrationEtimsStatus;
  outbox_id?: string | null;
  cu_invoice_no?: string | null;
  cu_receipt_no?: string | null;
  control_code?: string | null;
  internal_data?: string | null;
  receipt_signature?: string | null;
  qr_code_url?: string | null;
  sdc_datetime?: string | null;
  signed_at?: string | null;
  total_taxable_base?: string | null;
  total_tax_base?: string | null;
  total_gross_base?: string | null;
  rejection_reason?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** integration.etims_item_classification */
export interface IntegrationEtimsItemClassificationRow {
  code: string;
  name: string;
  tax_type: string | null;
  major_group: string | null;
  is_active: boolean;
  synced_at: string | null;
}

export interface IntegrationEtimsItemClassificationInsert {
  code: string;
  name: string;
  tax_type?: string | null;
  major_group?: string | null;
  is_active?: boolean;
  synced_at?: string | null;
}

/** integration.outbox */
export interface IntegrationOutboxRow {
  id: string;
  entity_id: string;
  channel: string;
  event_type: string;
  payload: unknown;
  source_type: string;
  source_id: string | null;
  dedupe_key: string;
  status: IntegrationDeliveryStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  response: unknown | null;
  available_after: string;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface IntegrationOutboxInsert {
  id?: string;
  entity_id: string;
  channel: string;
  event_type: string;
  payload: unknown;
  source_type: string;
  source_id?: string | null;
  dedupe_key: string;
  status?: IntegrationDeliveryStatus;
  attempts?: number;
  max_attempts?: number;
  next_attempt_at?: string;
  last_error?: string | null;
  response?: unknown | null;
  available_after?: string;
  locked_at?: string | null;
  locked_by?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

/** integration.outbox_attempt */
export interface IntegrationOutboxAttemptRow {
  id: string;
  outbox_id: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  succeeded: boolean | null;
  http_status: number | null;
  request_body: unknown | null;
  response_body: unknown | null;
  error_message: string | null;
  duration_ms: number | null;
}

export interface IntegrationOutboxAttemptInsert {
  id?: string;
  outbox_id: string;
  attempt_no: number;
  started_at?: string;
  finished_at?: string | null;
  succeeded?: boolean | null;
  http_status?: number | null;
  request_body?: unknown | null;
  response_body?: unknown | null;
  error_message?: string | null;
  duration_ms?: number | null;
}

/** integration.v_fiscalisation_backlog (view) */
export interface IntegrationVFiscalisationBacklogRow {
  entity_id: string | null;
  document_type: IntegrationEtimsDocumentType | null;
  internal_document_no: string | null;
  status: IntegrationEtimsStatus | null;
  created_at: string | null;
  attempts: number | null;
  last_error: string | null;
  next_attempt_at: string | null;
  age: string | null;
}

/** integration.v_items_missing_classification (view) */
export interface IntegrationVItemsMissingClassificationRow {
  entity_id: string | null;
  item_id: string | null;
  part_number: string | null;
  description: string | null;
  missing_class: string | null;
  missing_quantity_unit: string | null;
  missing_packaging_unit: string | null;
}

/** inv.bins */
export interface InvBinsRow {
  id: string;
  entity_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  bin_type: InvBinType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvBinsInsert {
  id?: string;
  entity_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  bin_type?: InvBinType;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.certificate_types */
export interface InvCertificateTypesRow {
  code: string;
  name: string;
  issuing_authority: string | null;
  proves_airworthiness: boolean;
  description: string;
}

export interface InvCertificateTypesInsert {
  code: string;
  name: string;
  issuing_authority?: string | null;
  proves_airworthiness?: boolean;
  description?: string;
}

/** inv.certificates */
export interface InvCertificatesRow {
  id: string;
  entity_id: string;
  certificate_type: string;
  certificate_number: string;
  issued_by: string;
  issuing_approval_no: string | null;
  issue_date: string;
  expiry_date: string | null;
  attachment_id: string | null;
  stock_unit_id: string | null;
  stock_lot_id: string | null;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface InvCertificatesInsert {
  id?: string;
  entity_id: string;
  certificate_type: string;
  certificate_number: string;
  issued_by: string;
  issuing_approval_no?: string | null;
  issue_date: string;
  expiry_date?: string | null;
  attachment_id?: string | null;
  stock_unit_id?: string | null;
  stock_lot_id?: string | null;
  verified_at?: string | null;
  verified_by?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

/** inv.condition_codes */
export interface InvConditionCodesRow {
  code: string;
  name: string;
  description: string;
  is_serviceable: boolean;
  is_installable: boolean;
  sort_order: number;
}

export interface InvConditionCodesInsert {
  code: string;
  name: string;
  description?: string;
  is_serviceable: boolean;
  is_installable: boolean;
  sort_order?: number;
}

/** inv.item_alternate_numbers */
export interface InvItemAlternateNumbersRow {
  id: string;
  entity_id: string;
  item_id: string;
  number_kind: InvPartNumberKind;
  part_number: string;
  counterparty_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface InvItemAlternateNumbersInsert {
  id?: string;
  entity_id: string;
  item_id: string;
  number_kind: InvPartNumberKind;
  part_number: string;
  counterparty_id?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

/** inv.item_categories */
export interface InvItemCategoriesRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  parent_id: string | null;
  ata_chapter: string | null;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  revenue_account_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvItemCategoriesInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  parent_id?: string | null;
  ata_chapter?: string | null;
  inventory_account_id?: string | null;
  cogs_account_id?: string | null;
  revenue_account_id?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.items */
export interface InvItemsRow {
  id: string;
  entity_id: string;
  part_number: string;
  description: string;
  category_id: string | null;
  manufacturer_id: string | null;
  manufacturer_part_number: string | null;
  nsn: string | null;
  uom_code: string;
  tracking_mode: InvTrackingMode;
  costing_method: InvCostingMethod;
  requires_certificate: boolean;
  requires_serial_on_receipt: boolean;
  is_life_limited: boolean;
  shelf_life_days: number | null;
  is_hazardous: boolean;
  is_dangerous_goods: boolean;
  un_number: string | null;
  is_export_controlled: boolean;
  eccn: string | null;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  revenue_account_id: string | null;
  default_tax_code_id: string | null;
  etims_item_class_code: string | null;
  etims_item_type: string | null;
  etims_packaging_unit: string | null;
  etims_quantity_unit: string | null;
  reorder_point: string | null;
  reorder_quantity: string | null;
  lead_time_days: number | null;
  is_stocked: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  sales_description: string | null;
  purchase_description: string | null;
  sales_price: string | null;
  purchase_cost: string | null;
  preferred_supplier_id: string | null;
  image_mime: string | null;
  image_bytes: Buffer | null;
}

export interface InvItemsInsert {
  id?: string;
  entity_id: string;
  part_number: string;
  description: string;
  category_id?: string | null;
  manufacturer_id?: string | null;
  manufacturer_part_number?: string | null;
  nsn?: string | null;
  uom_code: string;
  tracking_mode?: InvTrackingMode;
  costing_method?: InvCostingMethod;
  requires_certificate?: boolean;
  requires_serial_on_receipt?: boolean;
  is_life_limited?: boolean;
  shelf_life_days?: number | null;
  is_hazardous?: boolean;
  is_dangerous_goods?: boolean;
  un_number?: string | null;
  is_export_controlled?: boolean;
  eccn?: string | null;
  inventory_account_id?: string | null;
  cogs_account_id?: string | null;
  revenue_account_id?: string | null;
  default_tax_code_id?: string | null;
  etims_item_class_code?: string | null;
  etims_item_type?: string | null;
  etims_packaging_unit?: string | null;
  etims_quantity_unit?: string | null;
  reorder_point?: string | null;
  reorder_quantity?: string | null;
  lead_time_days?: number | null;
  is_stocked?: boolean;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  sales_description?: string | null;
  purchase_description?: string | null;
  sales_price?: string | null;
  purchase_cost?: string | null;
  preferred_supplier_id?: string | null;
  image_mime?: string | null;
  image_bytes?: Buffer | null;
}

/** inv.manufacturers */
export interface InvManufacturersRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  cage_code: string | null;
  country_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvManufacturersInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  cage_code?: string | null;
  country_code?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.stock_adjustments */
export interface InvStockAdjustmentsRow {
  id: string;
  entity_id: string;
  reference: string;
  adjustment_date: string;
  reason: string;
  adjustment_account_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvStockAdjustmentsInsert {
  id?: string;
  entity_id: string;
  reference: string;
  adjustment_date: string;
  reason: string;
  adjustment_account_id: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.stock_balances */
export interface InvStockBalancesRow {
  entity_id: string;
  item_id: string;
  warehouse_id: string;
  quantity_on_hand: string;
  value_base: string;
  average_cost_base: string;
  last_movement_at: string | null;
  updated_at: string;
}

export interface InvStockBalancesInsert {
  entity_id: string;
  item_id: string;
  warehouse_id: string;
  quantity_on_hand?: string;
  value_base?: string;
  average_cost_base?: string;
  last_movement_at?: string | null;
  updated_at?: string;
}

/** inv.stock_ledger */
export interface InvStockLedgerRow {
  id: string;
  entity_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id: string | null;
  stock_unit_id: string | null;
  stock_lot_id: string | null;
  movement_type: InvMovementType;
  movement_date: string;
  occurred_at: string;
  quantity: string;
  unit_cost_base: string;
  value_base: string;
  journal_entry_id: string | null;
  source_type: string;
  source_id: string | null;
  source_line_id: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface InvStockLedgerInsert {
  id: string;
  entity_id: string;
  item_id: string;
  warehouse_id: string;
  bin_id?: string | null;
  stock_unit_id?: string | null;
  stock_lot_id?: string | null;
  movement_type: InvMovementType;
  movement_date: string;
  occurred_at?: string;
  quantity: string;
  unit_cost_base?: string;
  value_base?: string;
  journal_entry_id?: string | null;
  source_type?: string;
  source_id?: string | null;
  source_line_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
  created_by?: string | null;
}

/** inv.stock_lots */
export interface InvStockLotsRow {
  id: string;
  entity_id: string;
  item_id: string;
  lot_number: string;
  condition_code: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  received_date: string;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvStockLotsInsert {
  id?: string;
  entity_id: string;
  item_id: string;
  lot_number: string;
  condition_code: string;
  manufacture_date?: string | null;
  expiry_date?: string | null;
  received_date?: string;
  supplier_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.stock_units */
export interface InvStockUnitsRow {
  id: string;
  entity_id: string;
  item_id: string;
  serial_number: string;
  batch_number: string | null;
  lot_id: string | null;
  condition_code: string;
  status: InvStockUnitStatus;
  warehouse_id: string | null;
  bin_id: string | null;
  manufacture_date: string | null;
  expiry_date: string | null;
  last_overhaul_date: string | null;
  total_time_hours: string | null;
  total_cycles: number | null;
  life_limit_hours: string | null;
  life_limit_cycles: number | null;
  received_date: string;
  supplier_id: string | null;
  acquisition_currency: string | null;
  acquisition_cost: string | null;
  unit_cost_base: string;
  landed_cost_base: string;
  sold_at: string | null;
  customer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvStockUnitsInsert {
  id?: string;
  entity_id: string;
  item_id: string;
  serial_number: string;
  batch_number?: string | null;
  lot_id?: string | null;
  condition_code: string;
  status?: InvStockUnitStatus;
  warehouse_id?: string | null;
  bin_id?: string | null;
  manufacture_date?: string | null;
  expiry_date?: string | null;
  last_overhaul_date?: string | null;
  total_time_hours?: string | null;
  total_cycles?: number | null;
  life_limit_hours?: string | null;
  life_limit_cycles?: number | null;
  received_date?: string;
  supplier_id?: string | null;
  acquisition_currency?: string | null;
  acquisition_cost?: string | null;
  unit_cost_base?: string;
  landed_cost_base?: string;
  sold_at?: string | null;
  customer_id?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** inv.units_of_measure */
export interface InvUnitsOfMeasureRow {
  code: string;
  name: string;
  category: string;
  is_active: boolean;
}

export interface InvUnitsOfMeasureInsert {
  code: string;
  name: string;
  category?: string;
  is_active?: boolean;
}

/** inv.v_expiry_watch (view) */
export interface InvVExpiryWatchRow {
  entity_id: string | null;
  stock_unit_id: string | null;
  part_number: string | null;
  serial_number: string | null;
  warehouse_id: string | null;
  expiry_date: string | null;
  days_remaining: number | null;
  expiry_status: string | null;
}

/** inv.v_stock_on_hand (view) */
export interface InvVStockOnHandRow {
  entity_id: string | null;
  stock_unit_id: string | null;
  item_id: string | null;
  part_number: string | null;
  description: string | null;
  serial_number: string | null;
  condition_code: string | null;
  condition_name: string | null;
  status: InvStockUnitStatus | null;
  warehouse_id: string | null;
  warehouse_code: string | null;
  bin_id: string | null;
  bin_code: string | null;
  expiry_date: string | null;
  total_cost_base: string | null;
  is_releasable: boolean | null;
  has_airworthiness_certificate: boolean | null;
}

/** inv.warehouses */
export interface InvWarehousesRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  address_id: string | null;
  inventory_account_id: string | null;
  is_consignment: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvWarehousesInsert {
  id?: string;
  entity_id: string;
  code: string;
  name: string;
  address_id?: string | null;
  inventory_account_id?: string | null;
  is_consignment?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.bill_lines */
export interface PurchBillLinesRow {
  id: string;
  entity_id: string;
  bill_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  expense_account_id: string | null;
  goods_receipt_line_id: string | null;
  created_at: string;
}

export interface PurchBillLinesInsert {
  id?: string;
  entity_id: string;
  bill_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  expense_account_id?: string | null;
  goods_receipt_line_id?: string | null;
  created_at?: string;
}

/** purch.bill_receipt_matches */
export interface PurchBillReceiptMatchesRow {
  id: string;
  entity_id: string;
  bill_id: string;
  goods_receipt_id: string;
  amount: string | null;
  created_at: string;
}

export interface PurchBillReceiptMatchesInsert {
  id?: string;
  entity_id: string;
  bill_id: string;
  goods_receipt_id: string;
  amount?: string | null;
  created_at?: string;
}

/** purch.bills */
export interface PurchBillsRow {
  id: string;
  entity_id: string;
  bill_no: string | null;
  status: PurchBillStatus;
  supplier_id: string;
  bill_date: string;
  due_date: string;
  currency_code: string;
  payment_terms_id: string | null;
  supplier_ref: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PurchBillsInsert {
  id?: string;
  entity_id: string;
  bill_no?: string | null;
  status?: PurchBillStatus;
  supplier_id: string;
  bill_date: string;
  due_date: string;
  currency_code: string;
  payment_terms_id?: string | null;
  supplier_ref?: string | null;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.goods_receipt_lines */
export interface PurchGoodsReceiptLinesRow {
  id: string;
  entity_id: string;
  goods_receipt_id: string;
  line_no: number;
  po_line_id: string | null;
  item_id: string;
  description: string;
  quantity: string;
  unit_cost: string;
  bin_id: string | null;
  stock_unit_id: string | null;
  serial_number: string | null;
  condition_code: string | null;
  stock_ledger_id: string | null;
  created_at: string;
}

export interface PurchGoodsReceiptLinesInsert {
  id?: string;
  entity_id: string;
  goods_receipt_id: string;
  line_no: number;
  po_line_id?: string | null;
  item_id: string;
  description: string;
  quantity: string;
  unit_cost: string;
  bin_id?: string | null;
  stock_unit_id?: string | null;
  serial_number?: string | null;
  condition_code?: string | null;
  stock_ledger_id?: string | null;
  created_at?: string;
}

/** purch.goods_receipts */
export interface PurchGoodsReceiptsRow {
  id: string;
  entity_id: string;
  grn_no: string | null;
  status: PurchGrnStatus;
  supplier_id: string;
  po_id: string | null;
  receipt_date: string;
  warehouse_id: string;
  notes: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PurchGoodsReceiptsInsert {
  id?: string;
  entity_id: string;
  grn_no?: string | null;
  status?: PurchGrnStatus;
  supplier_id: string;
  po_id?: string | null;
  receipt_date: string;
  warehouse_id: string;
  notes?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.purchase_order_lines */
export interface PurchPurchaseOrderLinesRow {
  id: string;
  entity_id: string;
  po_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  created_at: string;
}

export interface PurchPurchaseOrderLinesInsert {
  id?: string;
  entity_id: string;
  po_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  created_at?: string;
}

/** purch.purchase_orders */
export interface PurchPurchaseOrdersRow {
  id: string;
  entity_id: string;
  po_no: string | null;
  status: PurchPoStatus;
  supplier_id: string;
  order_date: string;
  expected_date: string | null;
  currency_code: string;
  payment_terms_id: string | null;
  warehouse_id: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  approved_at: string | null;
  approved_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PurchPurchaseOrdersInsert {
  id?: string;
  entity_id: string;
  po_no?: string | null;
  status?: PurchPoStatus;
  supplier_id: string;
  order_date: string;
  expected_date?: string | null;
  currency_code: string;
  payment_terms_id?: string | null;
  warehouse_id?: string | null;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.supplier_credit_lines */
export interface PurchSupplierCreditLinesRow {
  id: string;
  entity_id: string;
  credit_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  expense_account_id: string | null;
  stock_unit_id: string | null;
  warehouse_id: string | null;
  created_at: string;
}

export interface PurchSupplierCreditLinesInsert {
  id?: string;
  entity_id: string;
  credit_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  expense_account_id?: string | null;
  stock_unit_id?: string | null;
  warehouse_id?: string | null;
  created_at?: string;
}

/** purch.supplier_credits */
export interface PurchSupplierCreditsRow {
  id: string;
  entity_id: string;
  credit_no: string | null;
  status: PurchCreditStatus;
  supplier_id: string;
  credit_date: string;
  currency_code: string;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PurchSupplierCreditsInsert {
  id?: string;
  entity_id: string;
  credit_no?: string | null;
  status?: PurchCreditStatus;
  supplier_id: string;
  credit_date: string;
  currency_code: string;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.supplier_payment_allocations */
export interface PurchSupplierPaymentAllocationsRow {
  id: string;
  entity_id: string;
  payment_id: string;
  bill_id: string;
  amount: string;
  created_at: string;
}

export interface PurchSupplierPaymentAllocationsInsert {
  id?: string;
  entity_id: string;
  payment_id: string;
  bill_id: string;
  amount: string;
  created_at?: string;
}

/** purch.supplier_payments */
export interface PurchSupplierPaymentsRow {
  id: string;
  entity_id: string;
  payment_no: string | null;
  status: PurchPaymentStatus;
  supplier_id: string;
  payment_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo: string | null;
  journal_entry_id: string | null;
  reverse_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface PurchSupplierPaymentsInsert {
  id?: string;
  entity_id: string;
  payment_no?: string | null;
  status?: PurchPaymentStatus;
  supplier_id: string;
  payment_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo?: string | null;
  journal_entry_id?: string | null;
  reverse_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** purch.v_bill_balances (view) */
export interface PurchVBillBalancesRow {
  id: string | null;
  entity_id: string | null;
  total: string | null;
  allocated: string | null;
  outstanding: string | null;
}

/** sales.credit_note_allocations */
export interface SalesCreditNoteAllocationsRow {
  id: string;
  entity_id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: string;
  created_at: string;
}

export interface SalesCreditNoteAllocationsInsert {
  id?: string;
  entity_id: string;
  credit_note_id: string;
  invoice_id: string;
  amount: string;
  created_at?: string;
}

/** sales.credit_note_lines */
export interface SalesCreditNoteLinesRow {
  id: string;
  entity_id: string;
  credit_note_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  stock_unit_id: string | null;
  stock_lot_id: string | null;
  unit_cost_base: string | null;
  created_at: string;
}

export interface SalesCreditNoteLinesInsert {
  id?: string;
  entity_id: string;
  credit_note_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  stock_unit_id?: string | null;
  stock_lot_id?: string | null;
  unit_cost_base?: string | null;
  created_at?: string;
}

/** sales.credit_notes */
export interface SalesCreditNotesRow {
  id: string;
  entity_id: string;
  credit_no: string | null;
  status: SalesCreditNoteStatus;
  customer_id: string;
  credit_date: string;
  currency_code: string;
  warehouse_id: string | null;
  invoice_id: string | null;
  notes: string | null;
  restock: boolean;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesCreditNotesInsert {
  id?: string;
  entity_id: string;
  credit_no?: string | null;
  status?: SalesCreditNoteStatus;
  customer_id: string;
  credit_date: string;
  currency_code: string;
  warehouse_id?: string | null;
  invoice_id?: string | null;
  notes?: string | null;
  restock?: boolean;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.customer_reviews */
export interface SalesCustomerReviewsRow {
  id: string;
  entity_id: string;
  customer_id: string;
  invoice_id: string | null;
  rating: number;
  comment: string | null;
  submitted_at: string;
  created_at: string;
  created_by: string | null;
}

export interface SalesCustomerReviewsInsert {
  id?: string;
  entity_id: string;
  customer_id: string;
  invoice_id?: string | null;
  rating: number;
  comment?: string | null;
  submitted_at?: string;
  created_at?: string;
  created_by?: string | null;
}

/** sales.debit_note_lines */
export interface SalesDebitNoteLinesRow {
  id: string;
  entity_id: string;
  debit_note_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  created_at: string;
}

export interface SalesDebitNoteLinesInsert {
  id?: string;
  entity_id: string;
  debit_note_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  created_at?: string;
}

/** sales.debit_notes */
export interface SalesDebitNotesRow {
  id: string;
  entity_id: string;
  debit_no: string | null;
  status: SalesDebitNoteStatus;
  customer_id: string;
  debit_date: string;
  currency_code: string;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesDebitNotesInsert {
  id?: string;
  entity_id: string;
  debit_no?: string | null;
  status?: SalesDebitNoteStatus;
  customer_id: string;
  debit_date: string;
  currency_code: string;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.invoice_lines */
export interface SalesInvoiceLinesRow {
  id: string;
  entity_id: string;
  invoice_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  created_at: string;
  stock_unit_id: string | null;
  stock_lot_id: string | null;
  service_date: string | null;
}

export interface SalesInvoiceLinesInsert {
  id?: string;
  entity_id: string;
  invoice_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  created_at?: string;
  stock_unit_id?: string | null;
  stock_lot_id?: string | null;
  service_date?: string | null;
}

/** sales.invoices */
export interface SalesInvoicesRow {
  id: string;
  entity_id: string;
  invoice_no: string | null;
  status: SalesInvoiceStatus;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  currency_code: string;
  payment_terms_id: string | null;
  customer_po: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  void_of_invoice_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  warehouse_id: string | null;
  bill_email: string | null;
  ship_to_name: string | null;
  ship_to_address: string | null;
}

export interface SalesInvoicesInsert {
  id?: string;
  entity_id: string;
  invoice_no?: string | null;
  status?: SalesInvoiceStatus;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  currency_code: string;
  payment_terms_id?: string | null;
  customer_po?: string | null;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  void_of_invoice_id?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  warehouse_id?: string | null;
  bill_email?: string | null;
  ship_to_name?: string | null;
  ship_to_address?: string | null;
}

/** sales.quotation_lines */
export interface SalesQuotationLinesRow {
  id: string;
  entity_id: string;
  quotation_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  created_at: string;
}

export interface SalesQuotationLinesInsert {
  id?: string;
  entity_id: string;
  quotation_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  created_at?: string;
}

/** sales.quotations */
export interface SalesQuotationsRow {
  id: string;
  entity_id: string;
  quotation_no: string | null;
  status: SalesQuotationStatus;
  customer_id: string;
  quotation_date: string;
  valid_until: string | null;
  currency_code: string;
  payment_terms_id: string | null;
  warehouse_id: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  converted_invoice_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesQuotationsInsert {
  id?: string;
  entity_id: string;
  quotation_no?: string | null;
  status?: SalesQuotationStatus;
  customer_id: string;
  quotation_date: string;
  valid_until?: string | null;
  currency_code: string;
  payment_terms_id?: string | null;
  warehouse_id?: string | null;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  converted_invoice_id?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.receipt_allocations */
export interface SalesReceiptAllocationsRow {
  id: string;
  entity_id: string;
  receipt_id: string;
  invoice_id: string;
  amount: string;
  created_at: string;
}

export interface SalesReceiptAllocationsInsert {
  id?: string;
  entity_id: string;
  receipt_id: string;
  invoice_id: string;
  amount: string;
  created_at?: string;
}

/** sales.receipts */
export interface SalesReceiptsRow {
  id: string;
  entity_id: string;
  receipt_no: string | null;
  status: SalesReceiptStatus;
  customer_id: string;
  receipt_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo: string | null;
  journal_entry_id: string | null;
  reverse_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesReceiptsInsert {
  id?: string;
  entity_id: string;
  receipt_no?: string | null;
  status?: SalesReceiptStatus;
  customer_id: string;
  receipt_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo?: string | null;
  journal_entry_id?: string | null;
  reverse_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.refund_allocations */
export interface SalesRefundAllocationsRow {
  id: string;
  entity_id: string;
  refund_id: string;
  invoice_id: string;
  amount: string;
  created_at: string;
}

export interface SalesRefundAllocationsInsert {
  id?: string;
  entity_id: string;
  refund_id: string;
  invoice_id: string;
  amount: string;
  created_at?: string;
}

/** sales.refunds */
export interface SalesRefundsRow {
  id: string;
  entity_id: string;
  refund_no: string | null;
  status: SalesRefundStatus;
  customer_id: string;
  refund_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo: string | null;
  journal_entry_id: string | null;
  reverse_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesRefundsInsert {
  id?: string;
  entity_id: string;
  refund_no?: string | null;
  status?: SalesRefundStatus;
  customer_id: string;
  refund_date: string;
  currency_code: string;
  amount: string;
  bank_account_id: string;
  memo?: string | null;
  journal_entry_id?: string | null;
  reverse_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.sales_order_lines */
export interface SalesSalesOrderLinesRow {
  id: string;
  entity_id: string;
  sales_order_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  created_at: string;
}

export interface SalesSalesOrderLinesInsert {
  id?: string;
  entity_id: string;
  sales_order_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  created_at?: string;
}

/** sales.sales_orders */
export interface SalesSalesOrdersRow {
  id: string;
  entity_id: string;
  order_no: string | null;
  status: SalesSalesOrderStatus;
  customer_id: string;
  order_date: string;
  currency_code: string;
  payment_terms_id: string | null;
  warehouse_id: string | null;
  customer_po: string | null;
  notes: string | null;
  quotation_id: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  converted_invoice_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesSalesOrdersInsert {
  id?: string;
  entity_id: string;
  order_no?: string | null;
  status?: SalesSalesOrderStatus;
  customer_id: string;
  order_date: string;
  currency_code: string;
  payment_terms_id?: string | null;
  warehouse_id?: string | null;
  customer_po?: string | null;
  notes?: string | null;
  quotation_id?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  converted_invoice_id?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.sales_receipt_lines */
export interface SalesSalesReceiptLinesRow {
  id: string;
  entity_id: string;
  sales_receipt_id: string;
  line_no: number;
  item_id: string | null;
  description: string;
  service_date: string | null;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  tax_amount: string;
  line_net: string;
  revenue_account_id: string | null;
  stock_unit_id: string | null;
  stock_lot_id: string | null;
  created_at: string;
}

export interface SalesSalesReceiptLinesInsert {
  id?: string;
  entity_id: string;
  sales_receipt_id: string;
  line_no: number;
  item_id?: string | null;
  description: string;
  service_date?: string | null;
  quantity: string;
  unit_price: string;
  tax_code_id?: string | null;
  tax_amount?: string;
  line_net?: string;
  revenue_account_id?: string | null;
  stock_unit_id?: string | null;
  stock_lot_id?: string | null;
  created_at?: string;
}

/** sales.sales_receipts */
export interface SalesSalesReceiptsRow {
  id: string;
  entity_id: string;
  receipt_no: string | null;
  status: SalesSalesReceiptStatus;
  customer_id: string;
  receipt_date: string;
  currency_code: string;
  payment_terms_id: string | null;
  warehouse_id: string | null;
  bank_account_id: string;
  bill_email: string | null;
  ship_to_name: string | null;
  ship_to_address: string | null;
  customer_po: string | null;
  notes: string | null;
  subtotal: string;
  tax_total: string;
  total: string;
  journal_entry_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface SalesSalesReceiptsInsert {
  id?: string;
  entity_id: string;
  receipt_no?: string | null;
  status?: SalesSalesReceiptStatus;
  customer_id: string;
  receipt_date: string;
  currency_code: string;
  payment_terms_id?: string | null;
  warehouse_id?: string | null;
  bank_account_id: string;
  bill_email?: string | null;
  ship_to_name?: string | null;
  ship_to_address?: string | null;
  customer_po?: string | null;
  notes?: string | null;
  subtotal?: string;
  tax_total?: string;
  total?: string;
  journal_entry_id?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
}

/** sales.v_invoice_balances (view) */
export interface SalesVInvoiceBalancesRow {
  id: string | null;
  entity_id: string | null;
  total: string | null;
  allocated: string | null;
  outstanding: string | null;
}

/** Every relation, keyed by qualified name. */
export interface Database {
  'app.addresses': AppAddressesRow;
  'app.attachment_links': AppAttachmentLinksRow;
  'app.attachments': AppAttachmentsRow;
  'app.contacts': AppContactsRow;
  'app.currencies': AppCurrenciesRow;
  'app.customers': AppCustomersRow;
  'app.document_layout_settings': AppDocumentLayoutSettingsRow;
  'app.document_types': AppDocumentTypesRow;
  'app.employees': AppEmployeesRow;
  'app.entities': AppEntitiesRow;
  'app.fx_rates': AppFxRatesRow;
  'app.idempotency_keys': AppIdempotencyKeysRow;
  'app.numbering_sequences': AppNumberingSequencesRow;
  'app.payment_terms': AppPaymentTermsRow;
  'app.permissions': AppPermissionsRow;
  'app.role_permissions': AppRolePermissionsRow;
  'app.roles': AppRolesRow;
  'app.sales_survey_settings': AppSalesSurveySettingsRow;
  'app.suppliers': AppSuppliersRow;
  'app.tax_codes': AppTaxCodesRow;
  'app.user_effective_permissions': AppUserEffectivePermissionsRow;
  'app.user_roles': AppUserRolesRow;
  'app.users': AppUsersRow;
  'app.v_function_search_path': AppVFunctionSearchPathRow;
  'app.v_rls_coverage': AppVRlsCoverageRow;
  'audit.log': AuditLogRow;
  'gl.account_balance_period': GlAccountBalancePeriodRow;
  'gl.accounts': GlAccountsRow;
  'gl.entity_account_settings': GlEntityAccountSettingsRow;
  'gl.fiscal_periods': GlFiscalPeriodsRow;
  'gl.fiscal_years': GlFiscalYearsRow;
  'gl.fx_revaluation_position': GlFxRevaluationPositionRow;
  'gl.fx_revaluation_run': GlFxRevaluationRunRow;
  'gl.journal_entry': GlJournalEntryRow;
  'gl.journal_entry_line': GlJournalEntryLineRow;
  'gl.journal_sources': GlJournalSourcesRow;
  'gl.ob_ap_open_item': GlObApOpenItemRow;
  'gl.ob_ar_open_item': GlObArOpenItemRow;
  'gl.ob_batch': GlObBatchRow;
  'gl.ob_inventory_line': GlObInventoryLineRow;
  'gl.ob_trial_balance_line': GlObTrialBalanceLineRow;
  'gl.period_close_snapshot': GlPeriodCloseSnapshotRow;
  'gl.period_reopen_log': GlPeriodReopenLogRow;
  'gl.v_journal_entry': GlVJournalEntryRow;
  'integration.etims_device': IntegrationEtimsDeviceRow;
  'integration.etims_document': IntegrationEtimsDocumentRow;
  'integration.etims_item_classification': IntegrationEtimsItemClassificationRow;
  'integration.outbox': IntegrationOutboxRow;
  'integration.outbox_attempt': IntegrationOutboxAttemptRow;
  'integration.v_fiscalisation_backlog': IntegrationVFiscalisationBacklogRow;
  'integration.v_items_missing_classification': IntegrationVItemsMissingClassificationRow;
  'inv.bins': InvBinsRow;
  'inv.certificate_types': InvCertificateTypesRow;
  'inv.certificates': InvCertificatesRow;
  'inv.condition_codes': InvConditionCodesRow;
  'inv.item_alternate_numbers': InvItemAlternateNumbersRow;
  'inv.item_categories': InvItemCategoriesRow;
  'inv.items': InvItemsRow;
  'inv.manufacturers': InvManufacturersRow;
  'inv.stock_adjustments': InvStockAdjustmentsRow;
  'inv.stock_balances': InvStockBalancesRow;
  'inv.stock_ledger': InvStockLedgerRow;
  'inv.stock_lots': InvStockLotsRow;
  'inv.stock_units': InvStockUnitsRow;
  'inv.units_of_measure': InvUnitsOfMeasureRow;
  'inv.v_expiry_watch': InvVExpiryWatchRow;
  'inv.v_stock_on_hand': InvVStockOnHandRow;
  'inv.warehouses': InvWarehousesRow;
  'purch.bill_lines': PurchBillLinesRow;
  'purch.bill_receipt_matches': PurchBillReceiptMatchesRow;
  'purch.bills': PurchBillsRow;
  'purch.goods_receipt_lines': PurchGoodsReceiptLinesRow;
  'purch.goods_receipts': PurchGoodsReceiptsRow;
  'purch.purchase_order_lines': PurchPurchaseOrderLinesRow;
  'purch.purchase_orders': PurchPurchaseOrdersRow;
  'purch.supplier_credit_lines': PurchSupplierCreditLinesRow;
  'purch.supplier_credits': PurchSupplierCreditsRow;
  'purch.supplier_payment_allocations': PurchSupplierPaymentAllocationsRow;
  'purch.supplier_payments': PurchSupplierPaymentsRow;
  'purch.v_bill_balances': PurchVBillBalancesRow;
  'sales.credit_note_allocations': SalesCreditNoteAllocationsRow;
  'sales.credit_note_lines': SalesCreditNoteLinesRow;
  'sales.credit_notes': SalesCreditNotesRow;
  'sales.customer_reviews': SalesCustomerReviewsRow;
  'sales.debit_note_lines': SalesDebitNoteLinesRow;
  'sales.debit_notes': SalesDebitNotesRow;
  'sales.invoice_lines': SalesInvoiceLinesRow;
  'sales.invoices': SalesInvoicesRow;
  'sales.quotation_lines': SalesQuotationLinesRow;
  'sales.quotations': SalesQuotationsRow;
  'sales.receipt_allocations': SalesReceiptAllocationsRow;
  'sales.receipts': SalesReceiptsRow;
  'sales.refund_allocations': SalesRefundAllocationsRow;
  'sales.refunds': SalesRefundsRow;
  'sales.sales_order_lines': SalesSalesOrderLinesRow;
  'sales.sales_orders': SalesSalesOrdersRow;
  'sales.sales_receipt_lines': SalesSalesReceiptLinesRow;
  'sales.sales_receipts': SalesSalesReceiptsRow;
  'sales.v_invoice_balances': SalesVInvoiceBalancesRow;
}
