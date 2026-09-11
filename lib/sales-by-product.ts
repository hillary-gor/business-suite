import { Money } from '@/lib/money';

export type ProductSaleRow = {
  itemId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  productName: string;
  quantity: string;
  amount: string;
  cos: string;
};

export type ProductSaleMetrics = {
  key: string;
  name: string;
  quantity: string;
  amount: string;
  percentOfSales: string | null;
  avgPrice: string | null;
  cos: string;
  avgCos: string | null;
  grossMargin: string;
  grossMarginPercent: string | null;
};

export type ProductSaleSection =
  | {
      kind: 'category';
      key: string;
      name: string;
      lines: ProductSaleMetrics[];
      total: ProductSaleMetrics;
    }
  | { kind: 'item'; line: ProductSaleMetrics };

export function groupProductSales(rows: readonly ProductSaleRow[]): {
  sections: ProductSaleSection[];
  total: ProductSaleMetrics;
} {
  const grandAmount = Money.sum(rows.map((row) => row.amount));
  const sections: ProductSaleSection[] = [];
  let index = 0;
  while (index < rows.length) {
    const row = rows[index];
    if (!row) break;
    if (row.categoryId && row.categoryName) {
      const categoryId = row.categoryId;
      const categoryName = row.categoryName;
      const grouped: ProductSaleRow[] = [];
      while (index < rows.length && rows[index]?.categoryId === categoryId) {
        const next = rows[index];
        if (next) grouped.push(next);
        index += 1;
      }
      sections.push({
        kind: 'category',
        key: categoryId,
        name: categoryName,
        lines: grouped.map((line) => toMetrics(line, grandAmount)),
        total: aggregateMetrics(
          `total:${categoryId}`,
          `Total for ${categoryName}`,
          grouped,
          grandAmount,
        ),
      });
    } else {
      sections.push({ kind: 'item', line: toMetrics(row, grandAmount) });
      index += 1;
    }
  }

  return {
    sections,
    total: aggregateMetrics('total', 'TOTAL', rows, grandAmount),
  };
}

function toMetrics(row: ProductSaleRow, grandAmount: Money): ProductSaleMetrics {
  return measure({
    key: row.itemId ?? row.productName,
    name: row.productName,
    quantity: row.quantity,
    amount: row.amount,
    cos: row.cos,
    grandAmount,
  });
}

function aggregateMetrics(
  key: string,
  name: string,
  rows: readonly ProductSaleRow[],
  grandAmount: Money,
): ProductSaleMetrics {
  return measure({
    key,
    name,
    quantity: Money.sum(rows.map((row) => row.quantity)).toDatabase(),
    amount: Money.sum(rows.map((row) => row.amount)).toDatabase(),
    cos: Money.sum(rows.map((row) => row.cos)).toDatabase(),
    grandAmount,
  });
}

function measure(input: {
  key: string;
  name: string;
  quantity: string;
  amount: string;
  cos: string;
  grandAmount: Money;
}): ProductSaleMetrics {
  const quantity = Money.from(input.quantity);
  const amount = Money.from(input.amount);
  const cos = Money.from(input.cos);
  const margin = amount.minus(cos);
  return {
    key: input.key,
    name: input.name,
    quantity: input.quantity,
    amount: input.amount,
    percentOfSales: formatShare(amount, input.grandAmount),
    avgPrice: quantity.isZero() ? null : amount.dividedBy(quantity).toDatabase(),
    cos: input.cos,
    avgCos: quantity.isZero() ? null : cos.dividedBy(quantity).toDatabase(),
    grossMargin: margin.toDatabase(),
    grossMarginPercent: amount.isZero() ? null : formatShare(margin, amount),
  };
}

function formatShare(part: Money, whole: Money): string | null {
  if (whole.isZero()) return null;
  return `${part.times(100).dividedBy(whole).round(1).toDecimal().toFixed(1)}%`;
}
