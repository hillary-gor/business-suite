import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Default report settings · SkyJet' };

export default async function ReportSettingsPage() {
  const { entity } = await authorise(Permission.ReportsView);

  return (
    <>
      <PageHeader
        title="Default report settings"
        description="Reports run in this entity’s functional currency. Date ranges are chosen on each report."
      />
      <Card>
        <dl className="stack">
          <div>
            <dt className="cell-muted">Functional currency</dt>
            <dd>{entity.baseCurrency}</dd>
          </div>
          <div>
            <dt className="cell-muted">Entity</dt>
            <dd>{entity.name}</dd>
          </div>
        </dl>
        <div className="button-row" style={{ marginTop: 16 }}>
          <Link href="/reports" className="button">
            Open reports
          </Link>
          <Link href="/settings/company" className="button">
            Company details
          </Link>
        </div>
      </Card>
    </>
  );
}
