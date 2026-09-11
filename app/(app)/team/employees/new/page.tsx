import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listEmployees } from '@/server/modules/team/employees';
import { PageHeader } from '@/components/ui';
import { EmployeeForm } from '../employee-form';

export const metadata = { title: 'Add an employee · SkyJet' };

export default async function NewEmployeePage() {
  const { context, entity } = await authorise(Permission.TeamEmployeeManage);
  const managers = await listEmployees(context);

  return (
    <>
      <PageHeader
        title="Add an employee"
        description="An employee record is not a login. Give someone access to this system under Team, Manage users."
      />
      <EmployeeForm
        managers={managers.map((row) => ({ id: row.id, displayName: row.displayName }))}
        baseCurrency={entity.baseCurrency}
      />
    </>
  );
}
