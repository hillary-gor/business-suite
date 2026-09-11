import { formatQuantity, Money } from '@/lib/money';

export function taxLabelFor(code: string | null | undefined, rate?: string | null): string {
  const name = code?.trim();
  if (!name) return 'No tax';
  if (!rate || rate === '0') return name;
  return `${name} ${formatQuantity(Money.from(rate).times('100'))}%`;
}
