import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { getCurrentPeriod, listPeriods } from '@/server/modules/accounting/queries';
import { checkCloseReadiness } from '@/server/modules/accounting/periods';
import { Card, DataTable, EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { PeriodActions } from './period-actions';

export const metadata = { title: 'Periods · SkyJet' };

/**
 * The fiscal calendar.
 *
 * Closing a period is the point at which reported figures become final, so the
 * readiness checks are shown before the button rather than as errors after it.
 * Discovering the four reasons a period will not close by pressing a button
 * four times is a poor way to spend a month end.
 */
export default async function PeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: selected } = await searchParams;

  const { context, session, entity } = await authorise(Permission.ReportsView);
  const periods = await listPeriods(context);

  const focus = selected
    ? periods.find((p) => p.id === selected)
    : ((await getCurrentPeriod(context)) ?? periods[0]);

  const readiness =
    focus && focus.status === 'OPEN' ? await checkCloseReadiness(context, focus.id) : [];

  const mayClose = can(session, entity.entityId, Permission.GlClosePeriod);
  const mayReopen = can(session, entity.entityId, Permission.GlReopenPeriod);
  const mayRevalue = can(session, entity.entityId, Permission.GlRevalueFx);

  return (
    <>
      <PageHeader
        title="Fiscal periods"
        description="A closed period refuses every posting, including from the system itself. That is what makes a reported figure final."
      />

      {periods.length === 0 ? (
        <EmptyState
          title="No fiscal calendar"
          description="A fiscal year has to be created before anything can be posted."
        />
      ) : (
        <>
          {focus ? (
            <PeriodActions
              period={{
                id: focus.id,
                name: focus.name,
                status: focus.status,
                endDate: focus.endDate,
              }}
              readiness={readiness}
              mayClose={mayClose}
              mayReopen={mayReopen}
              mayRevalue={mayRevalue}
            />
          ) : null}

          <Card title="Calendar">
            <DataTable dense>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Year</th>
                  <th>Period</th>
                  <th style={{ width: 110 }}>Start</th>
                  <th style={{ width: 110 }}>End</th>
                  <th style={{ width: 100 }}>Status</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr
                    key={p.id}
                    style={p.id === focus?.id ? { background: 'var(--brand-tint)' } : undefined}
                  >
                    <td className="cell-code">{p.fiscalYear}</td>
                    <td>{p.name}</td>
                    <td className="cell-code">{p.startDate}</td>
                    <td className="cell-code">{p.endDate}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                    <td>
                      {p.id === focus?.id ? (
                        <span className="cell-muted text-small">selected</span>
                      ) : (
                        <a
                          href={`/accounting/periods?period=${p.id}`}
                          className="button button--small button--ghost"
                        >
                          Select
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </>
      )}
    </>
  );
}
