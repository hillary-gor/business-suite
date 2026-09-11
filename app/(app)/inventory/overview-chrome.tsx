'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  loadOverviewPrefs,
  OVERVIEW_WIDGET_IDS,
  parseSoldPeriod,
  saveOverviewPrefs,
  type OverviewWidgetId,
  type SoldPeriod,
} from '@/lib/inventory-overview';

export type CreateAction = {
  label: string;
  href?: string;
  disabled?: boolean;
  allowed?: boolean;
};

const WIDGET_TITLES: Record<OverviewWidgetId, string> = {
  lowStock: 'Low on stock',
  outOfStock: 'Out of stock',
  topSelling: 'Top selling products',
  openSalesOrders: 'Open sales orders',
  openPurchaseOrders: 'Open purchase orders',
  reports: 'Inventory reports',
};

const OverviewContext = createContext<{
  hidden: OverviewWidgetId[];
  hide: (id: OverviewWidgetId) => void;
} | null>(null);

export function InventoryOverviewShell({
  primaryActions,
  moreActions,
  children,
}: {
  primaryActions: readonly CreateAction[];
  moreActions: readonly CreateAction[];
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState<OverviewWidgetId[]>([]);
  const [customise, setCustomise] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setHidden(loadOverviewPrefs().hidden);
  }, []);

  function persist(next: OverviewWidgetId[]) {
    setHidden(next);
    saveOverviewPrefs({ hidden: next });
  }

  return (
    <OverviewContext.Provider
      value={{
        hidden,
        hide: (id) => persist([...new Set([...hidden, id])]),
      }}
    >
      <div className="inv-overview">
        <header className="inv-overview__head">
          <div className="inv-overview__title-row">
            <h1>Inventory overview</h1>
          </div>
          <div className="inv-overview__toolbar">
            <div className="inv-actions" aria-label="Create actions">
              <span className="inv-actions__label">Create actions</span>
              <div className="inv-actions__pills">
                {primaryActions.map((action) => (
                  <ActionPill key={action.label} action={action} />
                ))}
                {showAll
                  ? moreActions.map((action) => <ActionPill key={action.label} action={action} />)
                  : null}
                {moreActions.length > 0 ? (
                  <button
                    type="button"
                    className="inv-actions__more"
                    onClick={() => setShowAll((value) => !value)}
                  >
                    {showAll ? 'Show less' : 'Show all'}
                  </button>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="inv-overview__customise"
              aria-label="Customise widgets"
              onClick={() => setCustomise(true)}
            >
              <CustomiseIcon />
            </button>
          </div>
          <h2 className="inv-overview__kicker">Inventory at a glance</h2>
        </header>

        <div className="inv-glance">{children}</div>

        {customise ? (
          <CustomisePanel
            hidden={hidden}
            onChange={persist}
            onClose={() => setCustomise(false)}
          />
        ) : null}
      </div>
    </OverviewContext.Provider>
  );
}

export function OverviewCard({
  id,
  wide = false,
  children,
}: {
  id: OverviewWidgetId;
  wide?: boolean;
  children: ReactNode;
}) {
  const overview = useContext(OverviewContext);
  if (!overview || overview.hidden.includes(id)) return null;

  return (
    <div className={`inv-widget-slot${wide ? ' inv-widget-slot--wide' : ''}`}>
      <WidgetMenu title={WIDGET_TITLES[id]} onHide={() => overview.hide(id)} />
      {children}
    </div>
  );
}

function ActionPill({ action }: { action: CreateAction }) {
  const forbidden = action.allowed === false;
  const disabled = action.disabled || !action.href || forbidden;
  if (disabled) {
    return (
      <span
        className="inv-pill inv-pill--disabled"
        title={forbidden ? 'You do not have permission' : 'Not yet built'}
      >
        {action.label}
      </span>
    );
  }
  return (
    <Link href={action.href!} className="inv-pill">
      {action.label}
    </Link>
  );
}

function WidgetMenu({ title, onHide }: { title: string; onHide: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="inv-widget-menu" ref={rootRef}>
      <button
        type="button"
        className="inv-widget-menu__trigger"
        aria-label={`${title} options`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋮
      </button>
      {open ? (
        <div className="inv-widget-menu__panel" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onHide();
            }}
          >
            Hide this widget
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CustomisePanel({
  hidden,
  onChange,
  onClose,
}: {
  hidden: OverviewWidgetId[];
  onChange: (hidden: OverviewWidgetId[]) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const hiddenSet = new Set(hidden);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="inv-customise">
      <button type="button" className="inv-customise__backdrop" aria-label="Close" onClick={onClose} />
      <div className="inv-customise__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>Customise overview</h2>
        <p className="cell-muted">Choose which cards stay on Inventory at a glance.</p>
        <ul className="inv-customise__list">
          {OVERVIEW_WIDGET_IDS.map((id) => (
            <li key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={!hiddenSet.has(id)}
                  onChange={() =>
                    onChange(
                      hiddenSet.has(id) ? hidden.filter((item) => item !== id) : [...hidden, id],
                    )
                  }
                />
                {WIDGET_TITLES[id]}
              </label>
            </li>
          ))}
        </ul>
        <div className="button-row">
          <button type="button" className="button" onClick={() => onChange([])}>
            Show all
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function SoldPeriodSelect({ value }: { value: SoldPeriod }) {
  const router = useRouter();
  return (
    <label className="inv-widget__when">
      <span className="sr-only">Sales period</span>
      <select
        value={value}
        onChange={(event) => {
          const next = parseSoldPeriod(event.target.value);
          router.push(next === '30' ? '/inventory' : `/inventory?sold=${next}`);
        }}
      >
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="year">This year</option>
      </select>
    </label>
  );
}

function CustomiseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h10M20 7h0M4 12h4M14 12h6M4 17h8M16 17h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="16" cy="7" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="10" cy="12" r="2.25" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="14" cy="17" r="2.25" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
