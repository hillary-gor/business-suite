'use client';

/**
 * The manual journal form.
 *
 * Two design decisions here are worth explaining, because both look like extra
 * work and both prevent a specific, expensive mistake.
 *
 * First, the running total. It is computed with Money, the same decimal
 * arithmetic the database uses, and it is always visible. The user knows
 * whether the entry balances before they press Post, so "it does not balance"
 * stops being an error message and becomes something they can see and fix.
 *
 * Second, the idempotency key. It is generated once when the form mounts, not
 * when it is submitted. A user whose connection drops mid-post naturally
 * presses Post again; with the same key that second attempt returns the entry
 * that already landed instead of booking it twice. Generating the key at
 * submit time would give each attempt a fresh key and the protection would be
 * an illusion.
 */
import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postJournalAction } from '@/server/actions/accounting';
import { Money, formatMoney } from '@/lib/money';
import { Alert, Field } from '@/components/ui';
import { BusyLabel } from '@/components/loading/dots-loader';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  currencyCode: string | null;
  requiresCustomer: boolean;
  requiresSupplier: boolean;
  requiresWarehouse: boolean;
}

interface LineState {
  key: string;
  accountId: string;
  description: string;
  debit: string;
  credit: string;
}

const emptyLine = (): LineState => ({
  key: crypto.randomUUID(),
  accountId: '',
  description: '',
  debit: '',
  credit: '',
});

export function JournalForm({
  accounts,
  currencies,
  baseCurrency,
  openPeriods,
}: {
  accounts: readonly AccountOption[];
  currencies: ReadonlyArray<{ code: string; name: string; minorUnits: number }>;
  baseCurrency: string;
  openPeriods: ReadonlyArray<{ name: string; startDate: string; endDate: string }>;
}) {
  const router = useRouter();

  const defaultDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Default to today when today is in an open period, otherwise to the last
    // day of the latest open period, which is what a user posting a late
    // adjustment almost always wants.
    const covering = openPeriods.find((p) => p.startDate <= today && p.endDate >= today);
    if (covering) return today;
    return openPeriods.at(-1)?.endDate ?? today;
  }, [openPeriods]);

  const [entryDate, setEntryDate] = useState(defaultDate);
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [currencyCode, setCurrencyCode] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState('');
  const [lines, setLines] = useState<LineState[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const idempotencyKey = useRef(`journal-${crypto.randomUUID()}`);

  const totals = useMemo(() => {
    const safe = (value: string) => {
      const trimmed = value.trim();
      if (trimmed === '') return Money.zero();
      try {
        return Money.from(trimmed);
      } catch {
        // Mid-typing values like "1." are not yet valid; treat as zero rather
        // than throwing while the user is still typing.
        return Money.zero();
      }
    };

    const debits = Money.sum(lines.map((l) => safe(l.debit)));
    const credits = Money.sum(lines.map((l) => safe(l.credit)));
    const difference = debits.minus(credits);
    return { debits, credits, difference, balanced: difference.isZero() && debits.isPositive() };
  }, [lines]);

  const isForeign = currencyCode !== baseCurrency;
  const minorUnits = currencies.find((c) => c.code === currencyCode)?.minorUnits ?? 2;

  const periodForDate = openPeriods.find((p) => p.startDate <= entryDate && p.endDate >= entryDate);

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /**
   * Entering a debit clears the credit on the same line, and vice versa. The
   * database refuses a two-sided line, so silently allowing one to be typed
   * only produces an error later.
   */
  function setAmount(key: string, side: 'debit' | 'credit', value: string) {
    updateLine(key, side === 'debit' ? { debit: value, credit: '' } : { credit: value, debit: '' });
  }

  const dimensionWarnings = useMemo(() => {
    const warnings: string[] = [];
    for (const line of lines) {
      const account = accounts.find((a) => a.id === line.accountId);
      if (!account) continue;
      const needs = [
        account.requiresCustomer ? 'a customer' : null,
        account.requiresSupplier ? 'a supplier' : null,
        account.requiresWarehouse ? 'a warehouse' : null,
      ].filter(Boolean);
      if (needs.length > 0) {
        warnings.push(
          `${account.code} ${account.name} requires ${needs.join(' and ')} on every line. ` +
            'Post this through the relevant sales, purchasing or stock screen instead of a manual journal.',
        );
      }
    }
    return [...new Set(warnings)];
  }, [lines, accounts]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setFields({});

    const payload = {
      entryDate,
      description,
      reference: reference.trim() || undefined,
      currencyCode,
      fxRate: isForeign && fxRate.trim() ? fxRate.trim() : undefined,
      lines: lines
        .filter((l) => l.accountId && (l.debit.trim() || l.credit.trim()))
        .map((l) => ({
          accountId: l.accountId,
          description: l.description.trim() || undefined,
          debit: l.debit.trim() || undefined,
          credit: l.credit.trim() || undefined,
        })),
      idempotencyKey: idempotencyKey.current,
    };

    startTransition(async () => {
      const result = await postJournalAction(payload);

      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }

      setNotice(result.message ?? null);
      router.push(`/accounting/journals/${result.data.entryId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="stack">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      {dimensionWarnings.map((warning) => (
        <Alert key={warning} tone="warning" title="This account needs a dimension">
          {warning}
        </Alert>
      ))}

      <div className="form-row">
        <Field
          label="Entry date"
          htmlFor="entryDate"
          required
          error={fields.entryDate}
          hint={
            periodForDate
              ? `Falls in ${periodForDate.name}, which is open.`
              : 'No open period covers this date. The entry will be refused.'
          }
        >
          <input
            id="entryDate"
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            disabled={pending}
            required
          />
        </Field>

        <Field label="Reference" htmlFor="reference" hint="Optional. A cheque or document number.">
          <input
            id="reference"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={pending}
            maxLength={100}
          />
        </Field>

        <Field label="Currency" htmlFor="currency" error={fields.currencyCode}>
          <select
            id="currency"
            value={currencyCode}
            onChange={(e) => setCurrencyCode(e.target.value)}
            disabled={pending}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </Field>

        {isForeign ? (
          <Field
            label={`Rate to ${baseCurrency}`}
            htmlFor="fxRate"
            error={fields.fxRate}
            hint="Leave blank to use the rate recorded for the entry date."
          >
            <input
              id="fxRate"
              type="text"
              inputMode="decimal"
              className="input-amount"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              disabled={pending}
              placeholder="128.50000000"
            />
          </Field>
        ) : null}
      </div>

      <Field
        label="Narrative"
        htmlFor="description"
        required
        error={fields.description}
        hint="Explain what this entry is for. Someone will read this in two years without any other context."
      >
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={pending}
          maxLength={1000}
          placeholder="Accrue September freight from Aviall not yet invoiced, per shipment AWB 074-88213."
        />
      </Field>

      {fields.lines ? <Alert tone="danger">{fields.lines}</Alert> : null}
      {fields.form ? <Alert tone="danger">{fields.form}</Alert> : null}

      <div className="table-wrapper">
        <table className="journal-lines">
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              <th style={{ minWidth: 260 }}>Account</th>
              <th style={{ minWidth: 200 }}>Line narrative</th>
              <th className="numeric" style={{ width: 150 }}>
                Debit {currencyCode}
              </th>
              <th className="numeric" style={{ width: 150 }}>
                Credit {currencyCode}
              </th>
              <th style={{ width: 34 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.key}>
                <td className="line-no">{index + 1}</td>
                <td>
                  <select
                    value={line.accountId}
                    onChange={(e) => updateLine(line.key, { accountId: e.target.value })}
                    disabled={pending}
                    aria-label={`Account for line ${index + 1}`}
                  >
                    <option value="">Choose an account…</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} — {account.name}
                        {account.currencyCode ? ` (${account.currencyCode})` : ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    disabled={pending}
                    maxLength={500}
                    aria-label={`Narrative for line ${index + 1}`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-amount"
                    value={line.debit}
                    onChange={(e) => setAmount(line.key, 'debit', e.target.value)}
                    disabled={pending}
                    aria-label={`Debit for line ${index + 1}`}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-amount"
                    value={line.credit}
                    onChange={(e) => setAmount(line.key, 'credit', e.target.value)}
                    disabled={pending}
                    aria-label={`Credit for line ${index + 1}`}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="button--ghost button--small"
                    disabled={pending || lines.length <= 2}
                    onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}
                    aria-label={`Remove line ${index + 1}`}
                    title={lines.length <= 2 ? 'An entry needs at least two lines' : 'Remove line'}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="button-row">
        <button
          type="button"
          onClick={() => setLines((c) => [...c, emptyLine()])}
          disabled={pending}
        >
          Add line
        </button>
        {!totals.balanced && !totals.difference.isZero() ? (
          <button
            type="button"
            className="button--ghost"
            disabled={pending}
            onClick={() => {
              // Fills the balancing figure on the first empty amount, which is
              // the tedious part of entering a journal by hand.
              const gap = totals.difference;
              const target = lines.find((l) => !l.debit.trim() && !l.credit.trim());
              if (!target) return;
              setAmount(
                target.key,
                gap.isPositive() ? 'credit' : 'debit',
                gap.abs().roundToCurrency(minorUnits).toDecimal().toFixed(minorUnits),
              );
            }}
          >
            Balance to {formatMoney(totals.difference.abs(), { minorUnits })}
          </button>
        ) : null}
      </div>

      <div
        className={`balance-strip ${
          totals.balanced ? 'balance-strip--balanced' : 'balance-strip--unbalanced'
        }`}
      >
        <div className="balance-strip__item">
          <span className="balance-strip__label">Total debits</span>
          <span className="balance-strip__value">{formatMoney(totals.debits, { minorUnits })}</span>
        </div>
        <div className="balance-strip__item">
          <span className="balance-strip__label">Total credits</span>
          <span className="balance-strip__value">
            {formatMoney(totals.credits, { minorUnits })}
          </span>
        </div>
        <div className="balance-strip__item">
          <span className="balance-strip__label">
            {totals.balanced ? 'Balanced' : 'Difference'}
          </span>
          <span
            className="balance-strip__value"
            style={{ color: totals.balanced ? 'var(--positive)' : 'var(--caution)' }}
          >
            {totals.balanced ? '✓' : formatMoney(totals.difference, { minorUnits })}
          </span>
        </div>
      </div>

      <div className="button-row">
        <button
          type="submit"
          className="button--primary"
          disabled={pending || !totals.balanced || description.trim().length < 10}
        >
          <BusyLabel pending={pending} idle="Post entry" tone="inverse" />
        </button>
        <span className="text-muted text-small">
          {totals.balanced
            ? 'Once posted this entry cannot be amended or deleted, only reversed.'
            : 'The entry must balance before it can be posted.'}
        </span>
      </div>
    </form>
  );
}
