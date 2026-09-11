import Link from 'next/link';
import { Permission, type PermissionCode } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity, type Session } from '@/server/auth/session';
import { getCurrentPeriod, listPeriods } from '@/server/modules/accounting/queries';
import { getDashboardSnapshot } from '@/server/modules/dashboard/queries';
import { Money } from '@/lib/money';
import { Alert, Amount, Card, PageHeader, StatusBadge } from '@/components/ui';
import {
  AgeStrip,
  BankList,
  GlanceCard,
  PairBars,
  ShareList,
  expenseChange,
  moneyFigure,
} from '@/components/dashboard/glance';
import { SuitePrototypeGate } from '@/components/platform/suite-prototype-gate';

export const metadata = { title: 'Dashboard · SkyJet' };

/**
 * The dashboard.
 *
 * A glance, not a report pack. What matters on opening the app is whether the
 * books are sound, what cash and receivables look like, and this period's
 * result — with a path into the screen that can do something about it.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  if (!can(session, entity.entityId, Permission.ReportsView)) {
    return (
      <>
        <SuitePrototypeGate />
        <RoleHome session={session} entityId={entity.entityId} entityName={entity.name} />
      </>
    );
  }

  const periods = await listPeriods(context);
  const current = await getCurrentPeriod(context);
  const today = new Date().toISOString().slice(0, 10);
  const prior = current ? periods.find((period) => period.endDate < current.startDate) : undefined;

  const health = await getDashboardSnapshot(context, {
    fromDate: current?.startDate ?? today,
    toDate: current?.endDate ?? today,
    asAt: today,
    priorFrom: prior?.startDate,
    priorTo: prior?.endDate,
  });

  const ledgerBalanced = Money.from(health.ledgerNet).isZero();
  const stockTied = !health.stockTie || Money.from(health.stockTie.difference).isZero();
  const backlog = Number(health.outboxBacklog);
  const unclassified = Number(health.unclassified);

  const revenue = Money.sum(
    health.pnl.filter((row) => row.account_type === 'REVENUE').map((row) => row.amount),
  );
  const expenses = Money.sum(
    health.pnl.filter((row) => row.account_type === 'EXPENSE').map((row) => row.amount),
  );
  const netProfit = revenue.minus(expenses);
  const priorExpenses = Money.sum(
    health.priorPnl.filter((row) => row.account_type === 'EXPENSE').map((row) => row.amount),
  );
  const spendMove = expenseChange(expenses, priorExpenses);

  const expenseLines = health.pnl
    .filter((row) => row.account_type === 'EXPENSE')
    .map((row) => ({ id: row.account_id, label: row.name, amount: Money.from(row.amount) }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  const cashTotal = Money.sum(health.banks.map((row) => row.balance));
  const arTotal = Money.sum(health.aged.map((row) => row.outstanding));
  const openPeriods = periods.filter((p) => p.status === 'OPEN');
  const firstName = session.fullName.split(' ')[0];

  return (
    <>
      <SuitePrototypeGate />
      <div className="dashboard">
        <PageHeader
          title={`Good day, ${firstName}`}
          description={`${entity.name} · ${entity.baseCurrency}${
            current ? ` · ${current.name}` : ''
          }`}
        />

        {!ledgerBalanced ? (
          <Alert tone="danger" title="The general ledger does not net to zero">
            Debits and credits differ by <Amount value={health.ledgerNet} showCurrency />. The
            database enforces that every entry balances, so this should not be possible. Stop and
            investigate before relying on any report.
          </Alert>
        ) : null}

        {!stockTied && health.stockTie ? (
          <Alert tone="danger" title="Stock does not tie to the general ledger">
            The stock sub-ledger holds <Amount value={health.stockTie.subledger_value} /> but the
            inventory control account holds <Amount value={health.stockTie.ledger_value} />, a
            difference of <Amount value={health.stockTie.difference} />.
          </Alert>
        ) : null}

        {!health.openingPosted ? (
          <Alert tone="info" title="Opening balances have not been posted">
            Until the QuickBooks cutover is brought across, this ledger holds only what has been
            posted here.{' '}
            <Link href="/accounting/opening-balances">Import the opening balances</Link>.
          </Alert>
        ) : null}

        {openPeriods.length === 0 && periods.length > 0 ? (
          <Alert tone="warning" title="No period is open">
            Nothing can be posted until a period is opened.{' '}
            <Link href="/accounting/periods">Go to periods</Link>.
          </Alert>
        ) : null}

        <div className="dashboard__status">
          <GlanceCard
            kicker="Ledger integrity"
            when="Books"
            caption="Debits and credits"
            figure={ledgerBalanced ? 'Balanced' : 'Out of balance'}
            meta={`${health.entryCount} journal entries posted`}
            tone={ledgerBalanced ? 'ok' : 'bad'}
            footer={<Link href="/accounting/journals">View journals</Link>}
          />
          <GlanceCard
            kicker="Stock to ledger"
            when="Today"
            caption="Inventory control"
            figure={stockTied ? 'Tied' : 'Out'}
            meta={
              health.stockTie
                ? `Sub-ledger ${moneyFigure(Money.from(health.stockTie.subledger_value), entity.baseCurrency)}`
                : 'No stock on hand'
            }
            tone={stockTied ? 'ok' : 'bad'}
            footer={<Link href="/inventory/stock">View stock on hand</Link>}
          />
          <GlanceCard
            kicker="eTIMS backlog"
            when="Outbox"
            caption="Waiting to send"
            figure={String(backlog)}
            meta={backlog === 0 ? 'Nothing waiting to be sent' : 'Documents pending or failed'}
            tone={backlog === 0 ? 'ok' : 'warn'}
          />
          <GlanceCard
            kicker="Parts without a tax code"
            when="Catalogue"
            caption="Cannot be invoiced"
            figure={String(unclassified)}
            meta={
              unclassified === 0
                ? 'Every part is classified for eTIMS'
                : 'Classify these before they can be invoiced'
            }
            tone={unclassified === 0 ? 'ok' : 'warn'}
            footer={<Link href="/inventory/products">Open products</Link>}
          />
        </div>

        <div className="dashboard__glance">
          <GlanceCard
            kicker="Profit & loss"
            when={current?.name ?? 'This period'}
            caption={
              netProfit.isNegative()
                ? `Net loss for ${current?.name ?? 'this period'}`
                : `Net profit for ${current?.name ?? 'this period'}`
            }
            figure={
              <span
                className={netProfit.isNegative() ? 'glance-card__figure--negative' : undefined}
              >
                {moneyFigure(netProfit, entity.baseCurrency)}
              </span>
            }
            footer={
              <Link href={reportHref('/reports/profit-and-loss', current)}>
                Analyse profit &amp; loss
              </Link>
            }
          >
            <PairBars
              left={{ label: 'Income', amount: revenue }}
              right={{ label: 'Expenses', amount: expenses }}
            />
          </GlanceCard>

          <GlanceCard
            kicker="Expenses"
            when={current?.name ?? 'This period'}
            caption={`Spending for ${current?.name ?? 'this period'}`}
            figure={moneyFigure(expenses, entity.baseCurrency)}
            meta={
              spendMove ? (
                <span className={`glance-trend glance-trend--${spendMove.tone}`}>
                  {spendMove.text}
                </span>
              ) : (
                'No prior period to compare'
              )
            }
            footer={
              <Link href={reportHref('/reports/profit-and-loss', current)}>View all spending</Link>
            }
          >
            <ShareList items={expenseLines} total={expenses} />
          </GlanceCard>

          <GlanceCard
            kicker="Bank & cash"
            when="As of today"
            caption="Total in bank and cash"
            figure={moneyFigure(cashTotal, entity.baseCurrency)}
            footer={<Link href="/accounting/trial-balance">Go to trial balance</Link>}
          >
            <BankList
              accounts={health.banks.map((row) => ({
                id: row.id,
                name: row.name,
                controlType: row.control_type,
                balance: row.balance,
              }))}
            />
          </GlanceCard>
        </div>

        <div className="dashboard__lower">
          <GlanceCard
            kicker="Receivables"
            when="As of today"
            caption="Open invoices"
            figure={moneyFigure(arTotal, entity.baseCurrency)}
            footer={<Link href="/reports/aged-receivables">View aged receivables</Link>}
          >
            <AgeStrip buckets={health.aged} />
          </GlanceCard>

          <GlanceCard
            kicker="Periods"
            when={current ? current.fiscalYear : undefined}
            caption="Fiscal calendar"
            figure={current?.name ?? 'No calendar'}
            meta={
              openPeriods.length === 1
                ? '1 period open for posting'
                : `${openPeriods.length} periods open for posting`
            }
            footer={<Link href="/accounting/periods">Manage periods</Link>}
          >
            {periods.length === 0 ? (
              <p className="glance-empty">No fiscal calendar.</p>
            ) : (
              <ul className="glance-periods">
                {periods.slice(0, 6).map((period) => (
                  <li key={period.id}>
                    <Link href={`/accounting/periods?period=${period.id}`}>{period.name}</Link>
                    <span className="glance-periods__dates">
                      {period.startDate} – {period.endDate}
                    </span>
                    <StatusBadge status={period.status} />
                  </li>
                ))}
              </ul>
            )}
          </GlanceCard>
        </div>
      </div>
    </>
  );
}

function RoleHome({
  session,
  entityId,
  entityName,
}: {
  session: Session;
  entityId: string;
  entityName: string;
}) {
  const allow = (permission: PermissionCode) => can(session, entityId, permission);
  const firstName = session.fullName.split(' ')[0];
  const links: Array<{ href: string; label: string; description: string }> = [];

  if (allow(Permission.SalesInvoiceCreate)) {
    links.push({
      href: '/sales/invoices',
      label: 'Invoices',
      description: 'Create and issue customer invoices.',
    });
  }
  if (allow(Permission.MastersManageCustomers)) {
    links.push({
      href: '/sales/customers',
      label: 'Customers & leads',
      description: 'People and companies you invoice, plus estimates.',
    });
  }
  if (allow(Permission.ProcurementPurchaseCreate)) {
    links.push({
      href: '/purchasing/orders',
      label: 'Purchase orders',
      description: 'Create and send purchase orders.',
    });
  }
  if (allow(Permission.MastersManageSuppliers)) {
    links.push({
      href: '/purchasing/vendors',
      label: 'Suppliers',
      description: 'Maintain the supplier list.',
    });
  }
  if (allow(Permission.InvRead)) {
    links.push({
      href: '/inventory/stock',
      label: 'Stock on hand',
      description: 'See what is in the warehouse.',
    });
  }
  if (allow(Permission.MastersManageItems)) {
    links.push({
      href: '/inventory/products',
      label: 'Products',
      description: 'Maintain the parts catalogue.',
    });
  }

  return (
    <div className="dashboard">
      <PageHeader
        title={`Good day, ${firstName}`}
        description={`${entityName} · your role does not include the financial dashboard. Open the area you work in.`}
      />
      <div className="card-grid">
        {links.length === 0 ? (
          <Card>
            <p className="cell-muted">
              You can sign in, but this role has no operational screens yet. Ask an owner to assign
              a different role if that is unexpected.
            </p>
          </Card>
        ) : (
          links.map((link) => (
            <Card key={link.href}>
              <h2 className="card-title">{link.label}</h2>
              <p className="cell-muted">{link.description}</p>
              <div className="button-row">
                <Link href={link.href} className="button button--primary">
                  Open
                </Link>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function reportHref(path: string, period: { startDate: string; endDate: string } | null) {
  if (!period) return path;
  return `${path}?from=${period.startDate}&to=${period.endDate}`;
}
