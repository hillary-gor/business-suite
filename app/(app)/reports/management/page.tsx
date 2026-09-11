import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { Alert, PageHeader } from '@/components/ui';

export const metadata = { title: 'Management reports · SkyJet' };

export default async function ManagementReportsPage() {
  await authorise(Permission.ReportsView);
  return (
    <>
      <PageHeader
        title="Management reports"
        description="Packaged packs for lenders, boards and month-end."
      />
      <Alert tone="info" title="Not in this version">
        Management report packs are not shipping yet. The statements themselves are on{' '}
        <Link href="/reports">Standard reports</Link>.
      </Alert>
    </>
  );
}
