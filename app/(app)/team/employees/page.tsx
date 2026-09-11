import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listEmployees } from '@/server/modules/team/employees';
import { PageHeader } from '@/components/ui';
import { EmployeeList } from './employee-list';

export const metadata = { title: 'Employees · SkyJet' };

export default async function EmployeesPage() {
  const { context, session, entity } = await authorise(Permission.TeamEmployeeRead);
  const employees = await listEmployees(context);
  const mayManage = can(session, entity.entityId, Permission.TeamEmployeeManage);

  return (
    <>
      <PageHeader title="Employees" />
      <EmployeeList employees={employees} mayManage={mayManage} />
    </>
  );
}
