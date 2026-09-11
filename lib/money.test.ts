import { describe, expect, it } from 'vitest';
import { Money, MoneyError, convert, formatMoney, formatQuantity } from './money';

describe('Money', () => {
  it('adds without the floating point error that started all this', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE 754.
    expect(Money.from('0.1').plus('0.2').toDatabase()).toBe('0.3000');
  });

  it('sums a long list exactly', () => {
    const amounts = Array.from({ length: 1000 }, () => '0.01');
    expect(Money.sum(amounts).toDatabase()).toBe('10.0000');
  });

  it('rejects a number that has already lost precision', () => {
    // 0.1 + 0.2 is 0.30000000000000004, which has more decimals than the
    // ledger stores and could only have come from float arithmetic.
    expect(() => Money.from(0.1 + 0.2)).toThrow(MoneyError);
    expect(() => Money.from(1 / 3)).toThrow(MoneyError);
    expect(() => Money.from(0.12345)).toThrow(MoneyError);
  });

  it('accepts an exact number for convenience', () => {
    expect(Money.from(1250.75).toDatabase()).toBe('1250.7500');
    expect(Money.from(42).toDatabase()).toBe('42.0000');
    expect(Money.from(0.0001).toDatabase()).toBe('0.0001');
  });

  it('refuses anything that is not a monetary value', () => {
    expect(() => Money.from('')).toThrow(MoneyError);
    expect(() => Money.from('abc')).toThrow(MoneyError);
    expect(() => Money.from('12.34.56')).toThrow(MoneyError);
    expect(() => Money.from(Number.NaN)).toThrow(MoneyError);
    expect(() => Money.from(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it('tolerates thousands separators, which is how people paste figures', () => {
    expect(Money.from('1,234,567.89').toDatabase()).toBe('1234567.8900');
  });

  it('rounds half away from zero', () => {
    expect(Money.from('0.00005').round().toDatabase()).toBe('0.0001');
    expect(Money.from('-0.00005').round().toDatabase()).toBe('-0.0001');
    expect(Money.from('2.5').roundToCurrency(0).toDatabase()).toBe('3.0000');
    expect(Money.from('3.5').roundToCurrency(0).toDatabase()).toBe('4.0000');
  });

  it('does not round intermediate multiplication', () => {
    // A rate applied to a rate applied to an amount must not lose digits on
    // the way through.
    const result = Money.from('100').times('1.005').times('1.005');
    expect(result.toString()).toBe('101.0025');
  });

  it('refuses division by zero rather than returning infinity', () => {
    expect(() => Money.from('10').dividedBy('0')).toThrow(MoneyError);
  });

  it('transports as a string, never as a JSON number', () => {
    const encoded = JSON.stringify({ amount: Money.from('1280000.50') });
    expect(encoded).toBe('{"amount":"1280000.5000"}');
  });

  it('reports sign without treating zero as either', () => {
    expect(Money.zero().isPositive()).toBe(false);
    expect(Money.zero().isNegative()).toBe(false);
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.from('-0.0001').isNegative()).toBe(true);
  });
});

describe('exchange conversion', () => {
  it('applies a rate the same way the database does', () => {
    // 10,000 USD at 128.00 is 1,280,000 KES.
    expect(convert('10000', '128.00000000').toDatabase()).toBe('1280000.0000');
  });

  it('rounds the converted amount to storage scale', () => {
    // 33.33 × 141.33333333 is 4710.6399998889, which rounds to four places.
    expect(convert('33.33', '141.33333333').toDatabase()).toBe('4710.6400');
  });

  it('handles a rate below one', () => {
    expect(convert('1280000', '0.00781250').toDatabase()).toBe('10000.0000');
  });
});

describe('allocation', () => {
  it('splits a total that does not divide evenly without losing a cent', () => {
    const shares = Money.from('100').allocate([1, 1, 1], 2);
    expect(shares.map((s) => s.toDatabase())).toEqual(['33.3400', '33.3300', '33.3300']);
    expect(Money.sum(shares).roundToCurrency(2).toDatabase()).toBe('100.0000');
  });

  it('apportions freight across lines in proportion to their value', () => {
    // 45,000 of freight across three parts costing 850,000 / 1,150,000 / 500,000.
    const freight = Money.from('45000');
    const shares = freight.allocate(['850000', '1150000', '500000'], 2);
    expect(Money.sum(shares).roundToCurrency(2).toDatabase()).toBe('45000.0000');
    expect(shares[1]?.comparedTo(shares[0] ?? Money.zero())).toBe(1);
  });

  it('adds back to the original for a thousand awkward totals', () => {
    for (let cents = 1; cents <= 1000; cents += 1) {
      const total = Money.from((cents / 100).toFixed(2));
      const shares = total.allocate([1, 1, 1, 1, 1, 1, 7], 2);
      expect(Money.sum(shares).roundToCurrency(2).toDatabase()).toBe(
        total.roundToCurrency(2).toDatabase(),
      );
    }
  });

  it('allocates a negative total, as a credit note must', () => {
    const shares = Money.from('-100').allocate([1, 1, 1], 2);
    expect(Money.sum(shares).roundToCurrency(2).toDatabase()).toBe('-100.0000');
  });

  it('refuses weights that are all zero or negative', () => {
    expect(() => Money.from('100').allocate([0, 0], 2)).toThrow(MoneyError);
    expect(() => Money.from('100').allocate([1, -1], 2)).toThrow(MoneyError);
    expect(() => Money.from('100').allocate([], 2)).toThrow(MoneyError);
  });
});

describe('presentation', () => {
  it('groups thousands and fixes to the minor units', () => {
    expect(formatMoney('1280000.5')).toBe('1,280,000.50');
    expect(formatMoney('0.005')).toBe('0.01');
  });

  it('shows a negative in brackets, as an accountant expects', () => {
    expect(formatMoney('-1500')).toBe('(1,500.00)');
  });

  it('can carry the currency code', () => {
    expect(formatMoney('1000', { currency: 'USD', showCurrency: true })).toBe('USD 1,000.00');
  });

  it('trims meaningless trailing zeros from a quantity', () => {
    expect(formatQuantity('1.000000')).toBe('1');
    expect(formatQuantity('1.500000')).toBe('1.5');
    expect(formatQuantity('0.250000')).toBe('0.25');
  });
});
