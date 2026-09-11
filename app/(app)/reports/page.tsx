import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { allStandardReports } from '@/lib/standard-reports';
import { StandardReportsHome } from './standard-reports-home';

export const metadata = { title: 'Standard reports · SkyJet' };

export default async function ReportsHomePage() {
  await authorise(Permission.ReportsView);
  const byId = Object.fromEntries(allStandardReports().map((report) => [report.id, report]));

  return <StandardReportsHome byId={byId} />;
}
