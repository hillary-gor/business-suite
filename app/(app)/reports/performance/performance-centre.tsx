'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PageFeedback } from '@/components/lists/list-chrome';
import { CashChart, DonutChart, TimeChart } from '@/components/reports/performance-charts';
import { formatMoney } from '@/lib/money';
import {
  ADD_CHART_METRICS,
  CHART_DEFINITIONS,
  MAX_PERFORMANCE_CHARTS,
  PERFORMANCE_LAYOUT_KEY,
  PERFORMANCE_PERIODS,
  QUICK_ADD_METRICS,
  defaultPerformanceWidgets,
  newWidgetId,
  nextWidgetName,
  parsePerformanceWidgets,
  type ChartMetric,
  type ChartStyle,
  type PerformancePayload,
  type PerformanceWidget,
} from '@/lib/performance-centre';
import { widgetView } from '@/lib/performance-view';
import { reportPeriodLabel, type ReportPeriod } from '@/lib/report-periods';
import { useFeedback } from '@/components/feedback/feedback-host';

export function PerformanceCentre({
  companyName,
  currency,
  payload,
}: {
  companyName: string;
  currency: string;
  payload: PerformancePayload;
}) {
  const [widgets, setWidgets] = useState<PerformanceWidget[]>(defaultPerformanceWidgets);
  const [ready, setReady] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [exportOrder, setExportOrder] = useState<string[]>([]);
  const dragId = useRef<string | null>(null);
  const layoutDrag = useRef<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PERFORMANCE_LAYOUT_KEY);
      if (stored) {
        const parsed = parsePerformanceWidgets(JSON.parse(stored) as unknown);
        if (parsed) setWidgets(parsed);
      }
    } catch {
      /* keep defaults */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(PERFORMANCE_LAYOUT_KEY, JSON.stringify(widgets));
  }, [widgets, ready]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.perf-quick')) setQuickOpen(false);
      if (!target.closest('.perf-card__menu') && !target.closest('.perf-card__kebab')) {
        setMenuId(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setQuickOpen(false);
      setMenuId(null);
      setExportOpen(false);
      setAddOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!addOpen && !exportOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [addOpen, exportOpen]);

  const full = widgets.length >= MAX_PERFORMANCE_CHARTS;

  function addMetric(
    metric: ChartMetric,
    style?: ChartStyle,
    name?: string,
    period?: ReportPeriod,
  ) {
    if (full) return;
    const def = CHART_DEFINITIONS[metric];
    const widget: PerformanceWidget = {
      id: newWidgetId(metric),
      metric,
      name: name || nextWidgetName(metric, widgets),
      period: def.kind === 'aging' ? 'today' : (period ?? 'this_year_to_date'),
      style: style ?? def.defaultStyle,
    };
    setWidgets((current) => [...current, widget]);
    setQuickOpen(false);
    setAddOpen(false);
  }

  function removeWidget(id: string) {
    setWidgets((current) => current.filter((widget) => widget.id !== id));
    setMenuId(null);
  }

  function updateWidget(id: string, patch: Partial<PerformanceWidget>) {
    setWidgets((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, ...patch } : widget)),
    );
  }

  function dropWidget(id: string) {
    const from = layoutDrag.current;
    if (!from || from === id) return;
    setWidgets((current) => {
      const moving = current.find((widget) => widget.id === from);
      if (!moving) return current;
      const next = current.filter((widget) => widget.id !== from);
      const at = next.findIndex((widget) => widget.id === id);
      next.splice(at < 0 ? next.length : at, 0, moving);
      return next;
    });
    layoutDrag.current = null;
  }

  function openExport() {
    const ids = widgets.map((widget) => widget.id);
    setSelected(ids);
    setExportOrder(ids);
    setExportError('');
    setExportOpen(true);
  }

  async function downloadPdf() {
    const charts = exportOrder
      .filter((id) => selected.includes(id))
      .map((id) => widgets.find((widget) => widget.id === id))
      .filter((widget): widget is PerformanceWidget => Boolean(widget));
    if (charts.length === 0) return;
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch('/reports/performance/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ charts }),
      });
      if (!response.ok) throw new Error('The PDF could not be generated.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const header = response.headers.get('Content-Disposition');
      const match = header?.match(/filename="([^"]+)"/);
      link.href = url;
      link.download = match?.[1] ?? 'performance.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      setExportOpen(false);
    } catch {
      setExportError('The PDF could not be generated.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="perf">
      <header className="perf__head">
        <div className="perf__title-row">
          <h1>Performance centre</h1>
          <div className="perf__actions">
            <button
              type="button"
              className="perf__link"
              onClick={() => setAddOpen(true)}
              disabled={full}
            >
              Create custom charts
            </button>
            <div className="perf-quick">
              <button
                type="button"
                className="button"
                disabled={full}
                aria-expanded={quickOpen}
                onClick={() => setQuickOpen((open) => !open)}
              >
                Quick add charts
                <Chevron />
              </button>
              {quickOpen ? (
                <div className="perf-quick__menu" role="menu">
                  {QUICK_ADD_METRICS.map((metric) => (
                    <button
                      key={metric}
                      type="button"
                      role="menuitem"
                      onClick={() => addMetric(metric)}
                    >
                      {CHART_DEFINITIONS[metric].addLabel}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="button button--primary"
              disabled={full}
              onClick={() => setAddOpen(true)}
            >
              Add new chart
            </button>
          </div>
        </div>
        <p className="perf__method">Accounting method: Accrual basis</p>
        <div className="perf__toolbar">
          <button
            type="button"
            className="perf__link"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? 'Done' : 'Customise Layout'}
          </button>
          <div className="perf__toolbar-right">
            <p className="perf__count">
              {widgets.length} of {MAX_PERFORMANCE_CHARTS} charts created
            </p>
            <button
              type="button"
              className="perf__export"
              onClick={openExport}
              disabled={widgets.length === 0}
            >
              <ExportGlyph />
              Export
            </button>
            <PageFeedback />
          </div>
        </div>
      </header>

      {editing ? (
        <p className="perf__hint">Drag charts to rearrange. Choose Done when the layout is set.</p>
      ) : null}

      {widgets.length === 0 ? (
        <p className="perf__empty">Add a chart to start the board.</p>
      ) : (
        <div className="perf__grid">
          {widgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              payload={payload}
              currency={currency}
              editing={editing}
              menuOpen={menuId === widget.id}
              onMenu={() => setMenuId((current) => (current === widget.id ? null : widget.id))}
              onRemove={() => removeWidget(widget.id)}
              onPeriod={(period) => updateWidget(widget.id, { period })}
              onDragStart={() => {
                layoutDrag.current = widget.id;
              }}
              onDrop={() => dropWidget(widget.id)}
            />
          ))}
        </div>
      )}

      <p className="sr-only">
        {companyName} performance charts, updated {payload.asAt}.
      </p>

      {exportOpen ? (
        <ExportPanel
          widgets={widgets}
          selected={selected}
          order={exportOrder}
          error={exportError}
          busy={exporting}
          onClose={() => setExportOpen(false)}
          onToggle={(id) =>
            setSelected((current) =>
              current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
            )
          }
          onDragStart={(id) => {
            dragId.current = id;
          }}
          onDrop={(id) => {
            const from = dragId.current;
            if (!from || from === id) return;
            setExportOrder((current) => {
              const next = current.filter((item) => item !== from);
              const at = next.indexOf(id);
              next.splice(at < 0 ? next.length : at, 0, from);
              return next;
            });
            dragId.current = null;
          }}
          onExport={downloadPdf}
        />
      ) : null}

      {addOpen
        ? createPortal(
            <AddChartWizard
              existing={widgets}
              payload={payload}
              currency={currency}
              onClose={() => setAddOpen(false)}
              onAdd={addMetric}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function WidgetCard({
  widget,
  payload,
  currency,
  editing,
  menuOpen,
  onMenu,
  onRemove,
  onPeriod,
  onDragStart,
  onDrop,
}: {
  widget: PerformanceWidget;
  payload: PerformancePayload;
  currency: string;
  editing: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onRemove: () => void;
  onPeriod: (period: ReportPeriod) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const view = useMemo(() => widgetView(widget, payload, payload.asAt), [widget, payload]);
  const def = CHART_DEFINITIONS[widget.metric];
  const { open: openFeedback } = useFeedback();
  const headline = view.isMoney
    ? formatMoney(view.headline, { currency, showCurrency: true })
    : view.headline;

  return (
    <article
      className={`perf-card${editing ? ' is-editing' : ''}`}
      draggable={editing}
      onDragStart={editing ? onDragStart : undefined}
      onDragOver={editing ? (event) => event.preventDefault() : undefined}
      onDrop={editing ? onDrop : undefined}
    >
      <header className="perf-card__head">
        <h2>{view.title}</h2>
        {def.kind === 'aging' ? (
          <span className="perf-card__period">As of today</span>
        ) : (
          <label className="perf-card__period">
            <span className="sr-only">Time period</span>
            <select
              value={widget.period}
              onChange={(event) => onPeriod(event.target.value as ReportPeriod)}
            >
              {PERFORMANCE_PERIODS.map((period) => (
                <option key={period} value={period}>
                  {reportPeriodLabel(period)}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      <p className="perf-card__sub">{view.subtitle}</p>
      <p className="perf-card__value">{headline}</p>
      <div className="perf-card__chart">
        {view.aging ? (
          <DonutChart slices={view.aging} currency={currency} />
        ) : view.cash ? (
          <CashChart
            operating={view.cash.operating}
            investing={view.cash.investing}
            financing={view.cash.financing}
            currency={currency}
          />
        ) : (
          <TimeChart
            series={view.series}
            currency={currency}
            style={widget.style === 'bar' ? 'bar' : 'line'}
            isMoney={view.isMoney}
          />
        )}
      </div>
      {view.cash ? (
        <ul className="perf-card__legend">
          <li>
            <span style={{ background: '#34c759' }} /> Investing activities
          </li>
          <li>
            <span style={{ background: 'var(--brand)' }} /> Operating activities
          </li>
          <li>
            <span style={{ background: '#e6b800' }} /> Financing activities
          </li>
        </ul>
      ) : view.aging ? null : (
        <ul className="perf-card__legend">
          <li>
            <span style={{ background: 'var(--brand)' }} /> {def.shortName}
          </li>
          <li>
            <span className="is-prior" /> {def.shortName} ({Number(payload.asAt.slice(0, 4)) - 1})
          </li>
        </ul>
      )}
      <footer className="perf-card__foot">
        <button type="button" className="perf-card__ask" onClick={openFeedback}>
          <AskIcon />
          Ask a question
        </button>
        <div className="perf-card__kebab">
          <button type="button" className="list-tools__icon" title="Chart actions" onClick={onMenu}>
            ⋮
          </button>
          {menuOpen ? (
            <div className="perf-card__menu" role="menu">
              <button type="button" role="menuitem" onClick={onRemove}>
                Remove
              </button>
            </div>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function ExportPanel({
  widgets,
  selected,
  order,
  error,
  busy,
  onClose,
  onToggle,
  onDragStart,
  onDrop,
  onExport,
}: {
  widgets: readonly PerformanceWidget[];
  selected: readonly string[];
  order: readonly string[];
  error: string;
  busy: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
  onExport: () => void;
}) {
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close export"
        onClick={onClose}
      />
      <aside
        className="drawer perf-export"
        role="dialog"
        aria-modal="true"
        aria-label="Export charts"
      >
        <div className="drawer__header">
          <h2 className="drawer__title">Export charts</h2>
          <button type="button" className="button button--ghost button--small" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="drawer__body">
          <p className="perf-export__help">
            Select the charts you want to export. Drag charts to change the order they appear in the
            document.
          </p>
          <ul className="perf-export__list">
            {order.map((id) => {
              const widget = byId.get(id);
              if (!widget) return null;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => onDragStart(id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDrop(id)}
                >
                  <span className="perf-export__handle" aria-hidden="true">
                    <Grip />
                  </span>
                  <label>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() => onToggle(id)}
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                    {widget.name}
                  </label>
                </li>
              );
            })}
          </ul>
          {error ? <p className="perf-export__error">{error}</p> : null}
        </div>
        <div className="drawer__footer perf-export__foot">
          <button
            type="button"
            className="button button--primary"
            onClick={onExport}
            disabled={busy || selected.length === 0}
          >
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </aside>
    </>
  );
}

function AddChartWizard({
  existing,
  payload,
  currency,
  onClose,
  onAdd,
}: {
  existing: readonly PerformanceWidget[];
  payload: PerformancePayload;
  currency: string;
  onClose: () => void;
  onAdd: (metric: ChartMetric, style?: ChartStyle, name?: string, period?: ReportPeriod) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [metric, setMetric] = useState<ChartMetric | null>(null);
  const [name, setName] = useState('');
  const [period, setPeriod] = useState<ReportPeriod>('this_year_to_date');
  const [style, setStyle] = useState<ChartStyle>('line');
  const already = useMemo(() => new Set(existing.map((widget) => widget.metric)), [existing]);

  function pick(next: ChartMetric) {
    setMetric(next);
    const def = CHART_DEFINITIONS[next];
    setName(nextWidgetName(next, existing));
    setStyle(def.defaultStyle);
    setPeriod(def.kind === 'aging' ? 'today' : 'this_year_to_date');
  }

  const previewWidget: PerformanceWidget | null = metric
    ? { id: 'preview', metric, name, period, style }
    : null;
  const preview = previewWidget ? widgetView(previewWidget, payload, payload.asAt) : null;
  const def = metric ? CHART_DEFINITIONS[metric] : null;

  return (
    <div className="perf-wizard" role="dialog" aria-modal="true" aria-label="Add new chart">
      <header className="perf-wizard__bar">
        <h2>Add new chart</h2>
        <button type="button" className="perf-wizard__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>
      <div className="perf-wizard__body">
        {step === 1 ? (
          <div className="perf-wizard__card">
            <h3>What do you want to track?</h3>
            <p>
              You can customise a chart and filter it to your needs. You can also compare business
              performance details.
            </p>
            <div className="perf-picker">
              {ADD_CHART_METRICS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={metric === item ? 'is-on' : undefined}
                  onClick={() => pick(item)}
                >
                  {metric === item || already.has(item) ? (
                    <span className="perf-picker__check">✓</span>
                  ) : null}
                  <MetricIcon metric={item} />
                  {CHART_DEFINITIONS[item].shortName}
                </button>
              ))}
            </div>
            <footer className="perf-wizard__nav">
              <button type="button" className="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={!metric}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </footer>
          </div>
        ) : (
          <div className="perf-wizard__split">
            <section>
              <h3>Create your chart</h3>
              <p className="perf-wizard__hint">* indicates a required field</p>
              <details open className="perf-wizard__acc">
                <summary>Customise</summary>
                <label className="perf-wizard__field">
                  Name*
                  <input value={name} onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="perf-wizard__field">
                  Time period*
                  <select
                    value={period}
                    disabled={def?.kind === 'aging'}
                    onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
                  >
                    {def?.kind === 'aging' ? (
                      <option value="today">As of today</option>
                    ) : (
                      PERFORMANCE_PERIODS.map((item) => (
                        <option key={item} value={item}>
                          {reportPeriodLabel(item)}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label className="perf-wizard__field">
                  Group by*
                  <select disabled defaultValue="none">
                    <option value="none">None</option>
                  </select>
                </label>
              </details>
              <details className="perf-wizard__acc">
                <summary>Filter</summary>
                <p className="perf-wizard__hint">Filters are not in this version.</p>
              </details>
              <details className="perf-wizard__acc">
                <summary>Compare</summary>
                <p className="perf-wizard__hint">
                  Prior-year comparison is shown on time charts automatically.
                </p>
              </details>
            </section>
            <section>
              <h3>Preview</h3>
              {def?.kind !== 'aging' && def?.kind !== 'ratio' ? (
                <div className="perf-wizard__styles">
                  <button
                    type="button"
                    className={style === 'bar' ? 'is-on' : undefined}
                    onClick={() => setStyle('bar')}
                  >
                    <BarsIcon />
                    Vertical bars
                  </button>
                  <button
                    type="button"
                    className={style === 'line' ? 'is-on' : undefined}
                    onClick={() => setStyle('line')}
                  >
                    <LineIcon />
                    Trend line
                  </button>
                </div>
              ) : null}
              {preview ? (
                <article className="perf-card perf-card--preview">
                  <header className="perf-card__head">
                    <h2>{preview.title}</h2>
                  </header>
                  <p className="perf-card__sub">{preview.subtitle}</p>
                  <p className="perf-card__value">
                    {preview.isMoney
                      ? formatMoney(preview.headline, { currency, showCurrency: true })
                      : preview.headline}
                  </p>
                  {preview.aging ? (
                    <DonutChart slices={preview.aging} currency={currency} />
                  ) : preview.cash ? (
                    <CashChart
                      operating={preview.cash.operating}
                      investing={preview.cash.investing}
                      financing={preview.cash.financing}
                      currency={currency}
                    />
                  ) : (
                    <TimeChart
                      series={preview.series}
                      currency={currency}
                      style={style === 'bar' ? 'bar' : 'line'}
                      isMoney={preview.isMoney}
                    />
                  )}
                </article>
              ) : null}
              <button
                type="button"
                className="perf__link"
                onClick={() => {
                  if (!metric) return;
                  pick(metric);
                }}
              >
                Reset all
              </button>
            </section>
            <footer className="perf-wizard__nav perf-wizard__nav--split">
              <button type="button" className="button" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="button button--primary"
                disabled={!metric || name.trim() === ''}
                onClick={() => metric && onAdd(metric, style, name.trim(), period)}
              >
                Add to Dashboard
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricIcon({ metric }: { metric: ChartMetric }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {metric === 'expenses' ? (
        <path
          d="M6 4h9l3 4v12H6V4Zm3 6h6M9 14h4M14 4v4h4"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : metric === 'revenue' ? (
        <path
          d="M4 17V9l4 3 3-5 3 4 6-7M4 19h16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : metric === 'gross_profit' ? (
        <rect x="4" y="7" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      ) : metric === 'net_profit' ? (
        <path d="M5 5h14v14H5V5Zm4 8h6M12 9v8" stroke="currentColor" strokeWidth="1.6" />
      ) : metric === 'ar_aging' ? (
        <path
          d="M7 4h10v16H7V4Zm3 4h4M10 12h4M9 17l2 1.5 4-3"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : metric === 'ap_aging' ? (
        <path
          d="M4 6h11v12H4V6Zm15 3h-4v9h4V9ZM7 10h5M7 13h5"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : metric === 'cogs' ? (
        <path
          d="M7 4h10v16H7V4Zm3 4h4M8 12h3v5H8v-5Zm5 2h3v3h-3v-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : metric === 'cash_flow' ? (
        <path
          d="M4 18V10h3v8H4Zm5 0V6h3v12H9Zm5 0v-7h3v7h-3Zm5 0v-4h3v4h-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      ) : metric === 'current_ratio' ? (
        <path d="M5 5h14v14H5V5Zm4 9h6M12 8v6" stroke="currentColor" strokeWidth="1.6" />
      ) : (
        <path
          d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 4v4l3 2M9 17l2 1.5L15 15"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      )}
    </svg>
  );
}

function AskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 18h6M12 3a6 6 0 0 0-3.5 10.8c.6.5 1.1 1.4 1.1 2.2h4.8c0-.8.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExportGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h7l4 4v14H7V3Zm7 0v4h4M9 12h6M9 16h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Grip() {
  return (
    <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
      <circle cx="3" cy="3" r="1.3" fill="currentColor" />
      <circle cx="9" cy="3" r="1.3" fill="currentColor" />
      <circle cx="3" cy="8" r="1.3" fill="currentColor" />
      <circle cx="9" cy="8" r="1.3" fill="currentColor" />
      <circle cx="3" cy="13" r="1.3" fill="currentColor" />
      <circle cx="9" cy="13" r="1.3" fill="currentColor" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 18V10h3v8H5Zm5 0V6h4v12h-4Zm6 0v-7h3v7h-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 16 9 9l4 5 7-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
