'use client';

import { useEffect } from 'react';
import type { ReportRow } from '@/lib/report-view';
import type { ReportAccountingMethod } from '@/lib/standard-reports';

export type ReportDisplayOptions = {
  showZero: boolean;
  showSymbol: boolean;
  decimals: 0 | 2;
  negativesRed: boolean;
  divide1000: boolean;
  titles: Record<string, string>;
};

export function ReportCustomisePanel({
  open,
  onClose,
  onApply,
  accountingMethod,
  groups,
  draft,
  setDraft,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  accountingMethod: ReportAccountingMethod;
  groups: readonly ReportRow[];
  draft: ReportDisplayOptions;
  setDraft: (
    next: ReportDisplayOptions | ((current: ReportDisplayOptions) => ReportDisplayOptions),
  ) => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close customise" onClick={onClose} />
      <aside className="drawer rpt-customise-drawer" role="dialog" aria-modal="true" aria-label="Customise report">
        <div className="drawer__header">
          <h2 className="drawer__title">Customise</h2>
          <button type="button" className="button button--ghost button--small" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="drawer__body rpt-customise__body">
          <div className="rpt-customise__tabs">
            <button type="button" className="is-on">
              Display
            </button>
            <button type="button" disabled title="Not in this version">
              Visual
            </button>
          </div>
          {accountingMethod !== 'both' ? (
            <p className="rpt-customise__note">
              {accountingMethod === 'cash'
                ? 'This report is cash: it only includes money that moved through bank and cash accounts.'
                : 'This report is accrual. Figures come from posted journals on the document date, not from cash received or paid.'}
            </p>
          ) : null}
          <h2>Show non-zero or active</h2>
          <label className="rpt-customise__check">
            <input
              type="checkbox"
              checked={!draft.showZero}
              onChange={() => setDraft((current) => ({ ...current, showZero: !current.showZero }))}
            />
            Hide zero-amount rows
          </label>
          <h2>Number format</h2>
          <label className="rpt-customise__check">
            <input
              type="checkbox"
              checked={draft.divide1000}
              onChange={() => setDraft((current) => ({ ...current, divide1000: !current.divide1000 }))}
            />
            Divide by 1000
          </label>
          <label className="rpt-customise__check">
            <input
              type="checkbox"
              checked={!draft.showSymbol}
              onChange={() => setDraft((current) => ({ ...current, showSymbol: !current.showSymbol }))}
            />
            Don&apos;t show currency symbol
          </label>
          <label className="rpt-customise__check">
            <input
              type="checkbox"
              checked={draft.negativesRed}
              onChange={() => setDraft((current) => ({ ...current, negativesRed: !current.negativesRed }))}
            />
            Show negatives in red
          </label>
          <fieldset className="rpt-customise__radios">
            <legend>Decimals</legend>
            <label>
              <input
                type="radio"
                name="decimals"
                checked={draft.decimals === 0}
                onChange={() => setDraft((current) => ({ ...current, decimals: 0 }))}
              />
              Round to nearest whole number
            </label>
            <label>
              <input
                type="radio"
                name="decimals"
                checked={draft.decimals === 2}
                onChange={() => setDraft((current) => ({ ...current, decimals: 2 }))}
              />
              Show decimals up to 2 places
            </label>
          </fieldset>
          {groups.length > 0 ? (
            <>
              <h2>Edit section titles</h2>
              {groups.map((row) =>
                row.group ? (
                  <label key={row.key} className="rpt-customise__field">
                    <span>{row.values.name}</span>
                    <input
                      value={draft.titles[row.group] ?? row.values.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          titles: { ...current.titles, [row.group!]: event.target.value },
                        }))
                      }
                    />
                  </label>
                ) : null,
              )}
            </>
          ) : null}
        </div>
        <div className="drawer__footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={onApply}>
            Apply changes
          </button>
        </div>
      </aside>
    </>
  );
}
