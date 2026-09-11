import type { ReportDateMode } from '@/lib/standard-reports';

export type ReportColumn = {
  key: string;
  label: string;
  align?: 'left' | 'right';
  format?: 'text' | 'money' | 'qty' | 'date' | 'percent';
};

export type ReportRow = {
  key: string;
  values: Record<string, string>;
  role?: 'group' | 'line' | 'total' | 'grand';
  group?: string;
  href?: string;
  indent?: number;
  alwaysShow?: boolean;
};

export type ReportModel = {
  title: string;
  dateMode: ReportDateMode;
  columns: ReportColumn[];
  rows: ReportRow[];
  empty: string;
  unavailable?: string;
};

export function moneyColumn(key: string, label: string): ReportColumn {
  return { key, label, align: 'right', format: 'money' };
}

export function qtyColumn(key: string, label: string): ReportColumn {
  return { key, label, align: 'right', format: 'qty' };
}

export function textColumn(key: string, label: string): ReportColumn {
  return { key, label, format: 'text' };
}
