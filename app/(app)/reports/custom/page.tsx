import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { Alert, PageHeader } from '@/components/ui';

export const metadata = { title: 'Custom reports · SkyJet' };

export default async function CustomReportsPage() {
  await authorise(Permission.ReportsView);
  return (
    <>
      <PageHeader
        title="Custom reports"
        description="Build and save your own layouts from Standard Reports."
      />
      <Alert tone="info" title="Not in this version">
        Custom report builder is not shipping yet. Use <Link href="/reports">Standard reports</Link>{' '}
        and Customise on a report to change what you see.
      </Alert>
    </>
  );
}
