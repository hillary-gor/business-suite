/**
 * Monetary arithmetic.
 *
 * This is the only file in the application permitted to do arithmetic on a
 * monetary value. Everywhere else must call into here, and the ESLint config
 * blocks the obvious ways around it.
 *
 * The reason is narrow and specific: JavaScript numbers are IEEE 754 doubles,
 * and 0.1 + 0.2 is 0.30000000000000004. On one line that is invisible. Across
 * a year of invoices it is a reconciliation that never closes and nobody can
 * explain. Decimal arithmetic is not an optimisation here, it is the
 * difference between a ledger and an approximation of one.
 *
 * Conventions, matching the database:
 *   - amounts are stored and transported with 4 decimal places
 *   - amounts are presented rounded to the currency's minor units
 *   - rounding is half away from zero, which is what Kenyan tax practice and
 *     ordinary commercial expectation both assume
 *   - money crosses the wire as a string, never as a number, because JSON
 *     numbers are doubles and would undo all of this at the boundary
 */
import { Decimal } from 'decimal.js';

/** Decimal places every amount is stored with, matching app.money_amount. */
export const STORAGE_SCALE = 4;

/** Decimal places quantities are stored with, matching app.quantity. */
export const QUANTITY_SCALE = 6;

const MoneyDecimal = Decimal.clone({
  precision: 34,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -19,
  toExpPos: 21,
});

export type MoneyInput = string | number | Decimal | Money;

/**
 * An exact monetary amount.
 *
 * Immutable: every operation returns a new Money. There is no in-place
 * mutation, so an amount cannot be changed under a caller that is still
 * holding it.
 */
export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    this.value = value;
  }

  /**
   * Accepts a string, a Decimal, or another Money.
   *
   * A `number` is accepted only because reading a numeric literal in a test or
   * a constant is convenient, and it is validated to be an integer or a value
   * that survives the round trip through its own decimal representation. A
   * number that has already lost precision before arriving here cannot be
   * recovered, so it is rejected rather than silently accepted.
   */
  static from(input: MoneyInput): Money {
    if (input instanceof Money) return input;

    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new MoneyError(`Not a usable monetary value: ${input}`);
      }
      if (!Number.isSafeInteger(input) && !isStorable(input)) {
        throw new MoneyError(
          `The number ${input} cannot be stored exactly at ${STORAGE_SCALE} decimal places, ` +
            'which almost always means it is the result of floating point arithmetic. ' +
            'Pass money as a string and do the arithmetic with Money.',
        );
      }
      return new Money(new MoneyDecimal(input.toString()));
    }

    if (typeof input === 'string') {
      const trimmed = input.trim().replace(/,/g, '');
      if (trimmed === '') throw new MoneyError('An empty string is not a monetary value');
      if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
        throw new MoneyError(`Not a monetary value: ${JSON.stringify(input)}`);
      }
      return new Money(new MoneyDecimal(trimmed));
    }

    return new Money(new MoneyDecimal(input.toString()));
  }

  static zero(): Money {
    return new Money(new MoneyDecimal(0));
  }

  /** Sums a list exactly. An empty list is zero, not an error. */
  static sum(amounts: readonly MoneyInput[]): Money {
    return amounts.reduce<Money>((total, amount) => total.plus(amount), Money.zero());
  }

  plus(other: MoneyInput): Money {
    return new Money(this.value.plus(Money.from(other).value));
  }

  minus(other: MoneyInput): Money {
    return new Money(this.value.minus(Money.from(other).value));
  }

  /**
   * Multiplies by a rate or a quantity. Deliberately not rounded: rounding is
   * an explicit decision made once, at the point the result is stored, rather
   * than accumulated silently through a chain of operations.
   */
  times(factor: MoneyInput): Money {
    return new Money(this.value.times(Money.from(factor).value));
  }

  dividedBy(divisor: MoneyInput): Money {
    const d = Money.from(divisor).value;
    if (d.isZero()) throw new MoneyError('Division by zero');
    return new Money(this.value.dividedBy(d));
  }

  negated(): Money {
    return new Money(this.value.negated());
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  /** Rounds to the storage scale. Apply before persisting or comparing. */
  round(scale: number = STORAGE_SCALE): Money {
    return new Money(this.value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP));
  }

  /** Rounds to a currency's minor units, for presentation and settlement. */
  roundToCurrency(minorUnits: number): Money {
    return this.round(minorUnits);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  equals(other: MoneyInput): boolean {
    return this.value.equals(Money.from(other).value);
  }

  comparedTo(other: MoneyInput): -1 | 0 | 1 {
    return this.value.comparedTo(Money.from(other).value) as -1 | 0 | 1;
  }

  /** The string sent to Postgres. Fixed scale so the value is unambiguous. */
  toDatabase(): string {
    return this.round().value.toFixed(STORAGE_SCALE);
  }

  /** The string sent to a browser. Same reasoning: never a JSON number. */
  toJSON(): string {
    return this.toDatabase();
  }

  toString(): string {
    return this.value.toString();
  }

  toDecimal(): Decimal {
    return this.value;
  }

  /**
   * Splits an amount into parts in the given proportions without losing or
   * inventing a cent.
   *
   * This is what apportions freight and duty across the lines of an import,
   * and tax across the lines of an invoice. Rounding each share independently
   * would leave the shares not summing to the total, which then has to be
   * fudged somewhere. Instead each share is rounded down and the remainder is
   * distributed a unit at a time, largest fractional part first, so the result
   * always adds back to exactly the original.
   */
  allocate(weights: readonly MoneyInput[], scale: number = STORAGE_SCALE): Money[] {
    if (weights.length === 0) throw new MoneyError('Cannot allocate across no weights');

    const decimalWeights = weights.map((w) => Money.from(w).toDecimal());
    if (decimalWeights.some((w) => w.isNegative())) {
      throw new MoneyError('Allocation weights must not be negative');
    }

    const totalWeight = decimalWeights.reduce((a, b) => a.plus(b), new MoneyDecimal(0));
    if (totalWeight.isZero()) {
      throw new MoneyError('Allocation weights must not all be zero');
    }

    const unit = new MoneyDecimal(10).pow(-scale);
    const target = this.value.toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);

    const shares = decimalWeights.map((weight) =>
      target.times(weight).dividedBy(totalWeight).toDecimalPlaces(scale, Decimal.ROUND_DOWN),
    );

    const allocated = shares.reduce((a, b) => a.plus(b), new MoneyDecimal(0));
    let remainder = target.minus(allocated);

    // Give the leftover units to whoever was cut by the most.
    const order = decimalWeights
      .map((weight, index) => ({
        index,
        fraction: target
          .times(weight)
          .dividedBy(totalWeight)
          .minus(shares[index] ?? 0),
      }))
      .sort((a, b) => b.fraction.comparedTo(a.fraction));

    const step = remainder.isNegative() ? unit.negated() : unit;
    let cursor = 0;
    while (!remainder.isZero() && order.length > 0) {
      const target_index = order[cursor % order.length]?.index ?? 0;
      shares[target_index] = (shares[target_index] ?? new MoneyDecimal(0)).plus(step);
      remainder = remainder.minus(step);
      cursor += 1;
      if (cursor > order.length * (scale + 4) + 1000) {
        throw new MoneyError('Allocation failed to converge');
      }
    }

    return shares.map((s) => new Money(s));
  }
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/**
 * Whether a double can be stored exactly at the ledger's scale.
 *
 * Checking that the value survives a round trip through its own string form
 * would accept everything, since JavaScript's toString produces the shortest
 * representation that round-trips — including for 0.30000000000000004. The
 * useful question is instead whether the number has more decimal places than
 * the ledger stores. A literal like 1250.75 does not; the residue of a
 * floating point addition invariably does, and that is exactly the value that
 * must not be allowed in.
 */
function isStorable(value: number): boolean {
  const text = value.toString();
  if (text.includes('e') || text.includes('E')) return false;
  const decimals = text.split('.')[1]?.length ?? 0;
  return decimals <= STORAGE_SCALE;
}

/**
 * Applies an exchange rate, returning the amount in the target currency.
 * Rounded to storage scale, exactly as gl.post_entry does in the database, so
 * a figure computed for display agrees with the figure that gets posted.
 */
export function convert(amount: MoneyInput, rate: MoneyInput): Money {
  return Money.from(amount).times(rate).round();
}

/** Formats for display. Grouped, fixed to the currency's minor units. */
export function formatMoney(
  amount: MoneyInput,
  options: { currency?: string; minorUnits?: number; showCurrency?: boolean } = {},
): string {
  const { currency = 'KES', minorUnits = 2, showCurrency = false } = options;
  const rounded = Money.from(amount).roundToCurrency(minorUnits);
  const negative = rounded.isNegative();
  const [whole = '0', fraction] = rounded.abs().toDecimal().toFixed(minorUnits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = fraction ? `${grouped}.${fraction}` : grouped;
  const signed = negative ? `(${body})` : body;
  return showCurrency ? `${currency} ${signed}` : signed;
}

/** Formats a quantity, trimming trailing zeros so "1" does not read "1.000000". */
export function formatQuantity(quantity: MoneyInput): string {
  const value = Money.from(quantity).round(QUANTITY_SCALE).toDecimal();
  return value
    .toFixed()
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}
