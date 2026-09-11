import { Permission, type PermissionCode } from '@/server/auth/permissions';

export const DOCUMENT_PROFILES = [
  'commercial',
  'fulfillment',
  'payment',
  'statement',
  'inventory',
] as const;

export type DocumentProfile = (typeof DOCUMENT_PROFILES)[number];

export const DOCUMENT_KINDS = [
  'quotation',
  'proforma-invoice',
  'sales-order',
  'picking-list',
  'packing-list',
  'delivery-note',
  'proof-of-delivery',
  'invoice',
  'sales-receipt',
  'receipt',
  'credit-note',
  'debit-note',
  'refund',
  'purchase-order',
  'goods-receipt',
  'items-receipt',
  'supplier-bill',
  'supplier-payment',
  'supplier-credit',
  'customer-statement',
  'supplier-statement',
  'stock-transfer',
  'inventory-adjustment',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export type DocumentSource =
  | 'quotation'
  | 'sales-order'
  | 'invoice'
  | 'sales-receipt'
  | 'ar-receipt'
  | 'credit-note'
  | 'debit-note'
  | 'refund'
  | 'purchase-order'
  | 'goods-receipt'
  | 'bill'
  | 'supplier-payment'
  | 'supplier-credit'
  | 'customer-statement'
  | 'supplier-statement'
  | 'stock-transfer'
  | 'inventory-adjustment';

export type DocumentColumnKey =
  'description' | 'sku' | 'quantity' | 'unitPrice' | 'taxLabel' | 'amount' | 'extra';

export type DocumentColumn = {
  key: DocumentColumnKey;
  label: string;
  align?: 'left' | 'right';
};

export type DocumentSignature = {
  label: string;
  hint?: string;
};

export type DocumentKindConfig = {
  kind: DocumentKind;
  title: string;
  numberLabel: string;
  partyLabel: string;
  profile: DocumentProfile;
  source: DocumentSource;
  permission: PermissionCode;
  showMoney: boolean;
  columns: readonly DocumentColumn[];
  signatures: readonly DocumentSignature[];
  filenamePrefix: string;
};

const COMMERCIAL_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Description' },
  { key: 'sku', label: 'SKU' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'unitPrice', label: 'Rate', align: 'right' },
  { key: 'taxLabel', label: 'Tax' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

const FULFILLMENT_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Description' },
  { key: 'sku', label: 'SKU' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'extra', label: 'Location' },
];

const PAYMENT_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Applied to' },
  { key: 'extra', label: 'Date' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

const STATEMENT_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Document' },
  { key: 'extra', label: 'Date' },
  { key: 'sku', label: 'Due' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

const INVENTORY_COLUMNS: readonly DocumentColumn[] = [
  { key: 'description', label: 'Item' },
  { key: 'sku', label: 'SKU' },
  { key: 'extra', label: 'Warehouse' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'unitPrice', label: 'Cost', align: 'right' },
  { key: 'amount', label: 'Value', align: 'right' },
];

function kind(config: DocumentKindConfig): DocumentKindConfig {
  return config;
}

export const DOCUMENT_KIND_CONFIG: Record<DocumentKind, DocumentKindConfig> = {
  quotation: kind({
    kind: 'quotation',
    title: 'Quotation',
    numberLabel: 'Quote no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'quotation',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Quotation',
  }),
  'proforma-invoice': kind({
    kind: 'proforma-invoice',
    title: 'Proforma Invoice',
    numberLabel: 'Proforma no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'quotation',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Proforma-Invoice',
  }),
  'sales-order': kind({
    kind: 'sales-order',
    title: 'Sales Order',
    numberLabel: 'Order no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'sales-order',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Sales-Order',
  }),
  'picking-list': kind({
    kind: 'picking-list',
    title: 'Picking List',
    numberLabel: 'List no.',
    partyLabel: 'Customer',
    profile: 'fulfillment',
    source: 'sales-order',
    permission: Permission.SalesInvoiceCreate,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [{ label: 'Picked by' }, { label: 'Checked by' }],
    filenamePrefix: 'Picking-List',
  }),
  'packing-list': kind({
    kind: 'packing-list',
    title: 'Packing List',
    numberLabel: 'List no.',
    partyLabel: 'Customer',
    profile: 'fulfillment',
    source: 'invoice',
    permission: Permission.SalesInvoiceCreate,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [{ label: 'Packed by' }, { label: 'Received by' }],
    filenamePrefix: 'Packing-List',
  }),
  'delivery-note': kind({
    kind: 'delivery-note',
    title: 'Delivery Note',
    numberLabel: 'Note no.',
    partyLabel: 'Customer',
    profile: 'fulfillment',
    source: 'sales-order',
    permission: Permission.SalesInvoiceCreate,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [{ label: 'Dispatched by' }, { label: 'Received by' }],
    filenamePrefix: 'Delivery-Note',
  }),
  'proof-of-delivery': kind({
    kind: 'proof-of-delivery',
    title: 'Proof of Delivery',
    numberLabel: 'POD no.',
    partyLabel: 'Customer',
    profile: 'fulfillment',
    source: 'invoice',
    permission: Permission.SalesInvoiceCreate,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [
      { label: 'Delivered by' },
      { label: 'Received by', hint: 'Name, signature and date' },
    ],
    filenamePrefix: 'Proof-of-Delivery',
  }),
  invoice: kind({
    kind: 'invoice',
    title: 'Invoice',
    numberLabel: 'Invoice no.',
    partyLabel: 'Bill to',
    profile: 'commercial',
    source: 'invoice',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Invoice',
  }),
  'sales-receipt': kind({
    kind: 'sales-receipt',
    title: 'Sales Receipt',
    numberLabel: 'Receipt no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'sales-receipt',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Received by' }],
    filenamePrefix: 'Sales-Receipt',
  }),
  receipt: kind({
    kind: 'receipt',
    title: 'Receipt',
    numberLabel: 'Receipt no.',
    partyLabel: 'Customer',
    profile: 'payment',
    source: 'ar-receipt',
    permission: Permission.SalesPaymentCreate,
    showMoney: true,
    columns: PAYMENT_COLUMNS,
    signatures: [{ label: 'Received by' }],
    filenamePrefix: 'Receipt',
  }),
  'credit-note': kind({
    kind: 'credit-note',
    title: 'Credit Note',
    numberLabel: 'Credit no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'credit-note',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Credit-Note',
  }),
  'debit-note': kind({
    kind: 'debit-note',
    title: 'Debit Note',
    numberLabel: 'Debit no.',
    partyLabel: 'Customer',
    profile: 'commercial',
    source: 'debit-note',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Debit-Note',
  }),
  refund: kind({
    kind: 'refund',
    title: 'Refund',
    numberLabel: 'Refund no.',
    partyLabel: 'Customer',
    profile: 'payment',
    source: 'refund',
    permission: Permission.SalesPaymentCreate,
    showMoney: true,
    columns: PAYMENT_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Refund',
  }),
  'purchase-order': kind({
    kind: 'purchase-order',
    title: 'Purchase Order',
    numberLabel: 'PO no.',
    partyLabel: 'Supplier',
    profile: 'commercial',
    source: 'purchase-order',
    permission: Permission.ProcurementPurchaseCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Purchase-Order',
  }),
  'goods-receipt': kind({
    kind: 'goods-receipt',
    title: 'Goods Receipt',
    numberLabel: 'GRN no.',
    partyLabel: 'Supplier',
    profile: 'fulfillment',
    source: 'goods-receipt',
    permission: Permission.ProcurementPurchaseReceive,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [{ label: 'Received by' }, { label: 'Checked by' }],
    filenamePrefix: 'Goods-Receipt',
  }),
  'items-receipt': kind({
    kind: 'items-receipt',
    title: 'Item Receipt',
    numberLabel: 'GRN no.',
    partyLabel: 'Supplier',
    profile: 'fulfillment',
    source: 'goods-receipt',
    permission: Permission.ProcurementPurchaseReceive,
    showMoney: false,
    columns: FULFILLMENT_COLUMNS,
    signatures: [{ label: 'Received by' }, { label: 'Checked by' }],
    filenamePrefix: 'Item-Receipt',
  }),
  'supplier-bill': kind({
    kind: 'supplier-bill',
    title: 'Supplier Bill',
    numberLabel: 'Bill no.',
    partyLabel: 'Supplier',
    profile: 'commercial',
    source: 'bill',
    permission: Permission.FinancePaymentCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Bill',
  }),
  'supplier-payment': kind({
    kind: 'supplier-payment',
    title: 'Supplier Payment',
    numberLabel: 'Payment no.',
    partyLabel: 'Supplier',
    profile: 'payment',
    source: 'supplier-payment',
    permission: Permission.FinancePaymentCreate,
    showMoney: true,
    columns: PAYMENT_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Supplier-Payment',
  }),
  'supplier-credit': kind({
    kind: 'supplier-credit',
    title: 'Supplier Credit',
    numberLabel: 'Credit no.',
    partyLabel: 'Supplier',
    profile: 'commercial',
    source: 'supplier-credit',
    permission: Permission.FinancePaymentCreate,
    showMoney: true,
    columns: COMMERCIAL_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Supplier-Credit',
  }),
  'customer-statement': kind({
    kind: 'customer-statement',
    title: 'Customer Statement',
    numberLabel: 'As of',
    partyLabel: 'Customer',
    profile: 'statement',
    source: 'customer-statement',
    permission: Permission.SalesInvoiceCreate,
    showMoney: true,
    columns: STATEMENT_COLUMNS,
    signatures: [],
    filenamePrefix: 'Customer-Statement',
  }),
  'supplier-statement': kind({
    kind: 'supplier-statement',
    title: 'Supplier Statement',
    numberLabel: 'As of',
    partyLabel: 'Supplier',
    profile: 'statement',
    source: 'supplier-statement',
    permission: Permission.FinancePaymentCreate,
    showMoney: true,
    columns: STATEMENT_COLUMNS,
    signatures: [],
    filenamePrefix: 'Supplier-Statement',
  }),
  'stock-transfer': kind({
    kind: 'stock-transfer',
    title: 'Stock Transfer',
    numberLabel: 'Transfer no.',
    partyLabel: 'Warehouse',
    profile: 'inventory',
    source: 'stock-transfer',
    permission: Permission.InvManageStock,
    showMoney: true,
    columns: INVENTORY_COLUMNS,
    signatures: [{ label: 'Issued by' }, { label: 'Received by' }],
    filenamePrefix: 'Stock-Transfer',
  }),
  'inventory-adjustment': kind({
    kind: 'inventory-adjustment',
    title: 'Inventory Adjustment',
    numberLabel: 'Reference',
    partyLabel: 'Account',
    profile: 'inventory',
    source: 'inventory-adjustment',
    permission: Permission.InvAdjustStock,
    showMoney: true,
    columns: INVENTORY_COLUMNS,
    signatures: [{ label: 'Authorised by' }],
    filenamePrefix: 'Inventory-Adjustment',
  }),
};

const KIND_SET = new Set<string>(DOCUMENT_KINDS);

export function isDocumentKind(value: string): value is DocumentKind {
  return KIND_SET.has(value);
}

export function parseDocumentKind(value: string | undefined): DocumentKind | null {
  if (!value || !isDocumentKind(value)) return null;
  return value;
}

export function documentFilename(kind: DocumentKind, number: string): string {
  const prefix = DOCUMENT_KIND_CONFIG[kind].filenamePrefix;
  const slug = number.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'draft';
  return `${prefix}-${slug}.pdf`;
}
