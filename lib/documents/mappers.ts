import { displayCurrency } from '@/lib/inventory-overview';
import { DOCUMENT_KIND_CONFIG, type DocumentKind } from './kinds';
import { emptyCompany, type DocumentDraft, type DocumentModel, type DocumentParty } from './model';

export type CommercialPrintLine = {
  description: string;
  sku?: string | null;
  quantity: string;
  unitPrice: string;
  taxLabel?: string | null;
  taxAmount?: string | null;
  amount: string;
  extra?: string | null;
};

export type CommercialPrintInput = {
  kind: DocumentKind;
  number?: string | null;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  party: DocumentParty;
  shipTo?: DocumentParty | null;
  meta?: DocumentModel['meta'];
  lines: CommercialPrintLine[];
  subtotal: string;
  tax: string;
  total: string;
  balance?: string | null;
  terms?: string | null;
  notes?: string | null;
  references?: DocumentModel['references'];
  attachmentsNote?: string | null;
};

export function partyRoleFor(kind: DocumentKind): DocumentModel['partyRole'] {
  const source = DOCUMENT_KIND_CONFIG[kind].source;
  if (
    source === 'purchase-order' ||
    source === 'goods-receipt' ||
    source === 'bill' ||
    source === 'supplier-payment' ||
    source === 'supplier-credit' ||
    source === 'supplier-statement'
  ) {
    return 'supplier';
  }
  if (source === 'stock-transfer' || source === 'inventory-adjustment') return 'internal';
  return 'customer';
}

export function buildDocumentModel(input: CommercialPrintInput): DocumentModel {
  const config = DOCUMENT_KIND_CONFIG[input.kind];
  const number = input.number?.trim() || 'Draft';
  return {
    kind: input.kind,
    profile: config.profile,
    title: config.title,
    numberLabel: config.numberLabel,
    number,
    issueDate: input.issueDate,
    dueDate: input.dueDate ?? null,
    company: emptyCompany(),
    partyRole: partyRoleFor(input.kind),
    partyLabel: config.partyLabel,
    party: input.party,
    shipTo: input.shipTo ?? null,
    meta: input.meta ?? [],
    columns: [...config.columns],
    lines: input.lines.map((line) => ({
      description: line.description,
      sku: line.sku ?? null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxLabel: line.taxLabel ?? null,
      taxAmount: line.taxAmount ?? null,
      amount: line.amount,
      extra: line.extra ?? null,
    })),
    showMoney: config.showMoney,
    totals: config.showMoney
      ? {
          subtotal: input.subtotal,
          tax: input.tax,
          total: input.total,
          balance: input.balance ?? null,
          currency: displayCurrency(input.currency),
        }
      : null,
    terms: input.terms ?? null,
    notes: input.notes ?? null,
    references: input.references ?? [],
    signatures: [...config.signatures],
    attachmentsNote: input.attachmentsNote ?? null,
  };
}

export function documentModelFromDraft(draft: DocumentDraft): DocumentModel {
  return buildDocumentModel({
    kind: draft.kind,
    number: draft.number,
    issueDate: draft.issueDate,
    dueDate: draft.dueDate,
    currency: draft.currency,
    party: draft.party,
    shipTo: draft.shipTo,
    meta: draft.meta,
    lines: draft.lines.map((line) => ({
      description: line.description,
      sku: line.sku,
      quantity: line.quantity || '0',
      unitPrice: line.unitPrice || '0',
      taxLabel: line.taxLabel,
      taxAmount: line.taxAmount,
      amount: line.amount || '0',
      extra: line.extra,
    })),
    subtotal: draft.subtotal || '0',
    tax: draft.tax || '0',
    total: draft.total || '0',
    balance: draft.balance,
    terms: draft.terms,
    notes: draft.notes,
    references: draft.references,
  });
}

export function withCompany(
  model: DocumentModel,
  company: DocumentModel['company'],
): DocumentModel {
  return { ...model, company };
}

export function visibleColumns(model: DocumentModel): DocumentModel['columns'] {
  if (model.showMoney) return model.columns;
  return model.columns.filter(
    (column) => column.key !== 'unitPrice' && column.key !== 'taxLabel' && column.key !== 'amount',
  );
}

export function mapPaymentDocument(input: {
  kind: 'receipt' | 'refund' | 'supplier-payment';
  number?: string | null;
  issueDate: string;
  party: DocumentParty;
  currency: string;
  amount: string;
  notes?: string | null;
  allocations: Array<{ description: string; date: string; amount: string }>;
}): DocumentModel {
  const lines =
    input.allocations.length > 0
      ? input.allocations.map((row) => ({
          description: row.description,
          extra: row.date,
          quantity: '',
          unitPrice: '',
          amount: row.amount,
        }))
      : [
          {
            description: 'Amount',
            extra: input.issueDate,
            quantity: '',
            unitPrice: '',
            amount: input.amount,
          },
        ];
  return buildDocumentModel({
    kind: input.kind,
    number: input.number,
    issueDate: input.issueDate,
    currency: input.currency,
    party: input.party,
    lines,
    subtotal: input.amount,
    tax: '0',
    total: input.amount,
    notes: input.notes,
  });
}

export type StatementPrintRow = {
  description: string;
  date: string;
  due?: string | null;
  amount: string;
};

export function mapStatementDocument(input: {
  kind: 'customer-statement' | 'supplier-statement';
  asOf: string;
  party: DocumentParty;
  currency: string;
  openRows: StatementPrintRow[];
  activityRows?: StatementPrintRow[];
  total: string;
}): DocumentModel {
  const lines = [
    ...input.openRows.map((row) => ({
      description: row.description,
      extra: row.date,
      sku: row.due ?? null,
      quantity: '',
      unitPrice: '',
      amount: row.amount,
    })),
  ];
  if (input.activityRows && input.activityRows.length > 0) {
    lines.push({
      description: 'Recent activity',
      extra: '',
      sku: null,
      quantity: '',
      unitPrice: '',
      amount: '',
    });
    for (const row of input.activityRows) {
      lines.push({
        description: row.description,
        extra: row.date,
        sku: row.due ?? null,
        quantity: '',
        unitPrice: '',
        amount: row.amount,
      });
    }
  }
  return buildDocumentModel({
    kind: input.kind,
    number: input.asOf,
    issueDate: input.asOf,
    currency: input.currency,
    party: input.party,
    lines,
    subtotal: input.total,
    tax: '0',
    total: input.total,
    notes: 'Open balances as of the statement date.',
  });
}
