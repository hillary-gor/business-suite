export type DocumentType =
  | 'INVOICE'
  | 'SALES_RECEIPT'
  | 'ESTIMATE'
  | 'CREDIT_NOTE'
  | 'SALES_ORDER';

export const DOCUMENT_TYPES: ReadonlyArray<{ id: DocumentType; label: string }> = [
  { id: 'INVOICE', label: 'Invoice' },
  { id: 'SALES_RECEIPT', label: 'Sales receipt' },
  { id: 'ESTIMATE', label: 'Estimate' },
  { id: 'CREDIT_NOTE', label: 'Credit note' },
  { id: 'SALES_ORDER', label: 'Sales order' },
];

export type ColumnKey =
  | 'line_no'
  | 'service_date'
  | 'product'
  | 'sku'
  | 'description'
  | 'qty'
  | 'rate'
  | 'amount';

export interface ColumnLayout {
  visible: boolean;
  label: string;
}

export interface DocumentLayout {
  show_logo: boolean;
  show_ship_to: boolean;
  show_document_no: boolean;
  show_document_date: boolean;
  show_due_date: boolean;
  show_terms: boolean;
  show_customer_email: boolean;
  show_customer_contact: boolean;
  show_company_registration: boolean;
  show_table: boolean;
  columns: Record<ColumnKey, ColumnLayout>;
}

export const DEFAULT_DOCUMENT_LAYOUT: DocumentLayout = {
  show_logo: true,
  show_ship_to: true,
  show_document_no: true,
  show_document_date: true,
  show_due_date: true,
  show_terms: true,
  show_customer_email: true,
  show_customer_contact: true,
  show_company_registration: true,
  show_table: true,
  columns: {
    line_no: { visible: true, label: '#' },
    service_date: { visible: false, label: 'Service date' },
    product: { visible: true, label: 'Product/service' },
    sku: { visible: true, label: 'SKU' },
    description: { visible: true, label: 'Description' },
    qty: { visible: true, label: 'Qty' },
    rate: { visible: true, label: 'Rate' },
    amount: { visible: true, label: 'Amount' },
  },
};

export const HEADER_TOGGLES: ReadonlyArray<{ key: keyof DocumentLayout; label: string }> = [
  { key: 'show_logo', label: 'Logo' },
  { key: 'show_ship_to', label: 'Ship to' },
  { key: 'show_document_no', label: 'Invoice / document no.' },
  { key: 'show_document_date', label: 'Invoice date' },
  { key: 'show_due_date', label: 'Due date' },
  { key: 'show_terms', label: 'Terms' },
  { key: 'show_customer_email', label: 'Customer email' },
  { key: 'show_customer_contact', label: 'Customer contact info' },
  { key: 'show_company_registration', label: 'Company registration number' },
  { key: 'show_table', label: 'Table content' },
];

export const COLUMN_KEYS: readonly ColumnKey[] = [
  'line_no',
  'service_date',
  'product',
  'sku',
  'description',
  'qty',
  'rate',
  'amount',
];

export function mergeLayout(partial?: Partial<DocumentLayout> | null): DocumentLayout {
  const base = structuredClone(DEFAULT_DOCUMENT_LAYOUT);
  if (!partial) return base;
  for (const key of Object.keys(base) as (keyof DocumentLayout)[]) {
    if (key === 'columns') continue;
    if (typeof partial[key] === 'boolean') {
      (base as unknown as Record<string, unknown>)[key] = partial[key];
    }
  }
  if (partial.columns) {
    for (const col of COLUMN_KEYS) {
      if (partial.columns[col]) {
        base.columns[col] = {
          visible: partial.columns[col].visible ?? base.columns[col].visible,
          label: partial.columns[col].label || base.columns[col].label,
        };
      }
    }
  }
  return base;
}
