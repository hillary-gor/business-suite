import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getEmployee, listEmployees } from '@/server/modules/team/employees';
import { PageHeader } from '@/components/ui';
import { EmployeeForm } from '../../employee-form';

export const metadata = { title: 'Edit employee · SkyJet' };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const { context, entity } = await authorise(Permission.TeamEmployeeManage);
  const [employee, everyone] = await Promise.all([
    getEmployee(context, employeeId),
    listEmployees(context),
  ]);
  if (!employee) notFound();

  return (
    <>
      <PageHeader title={employee.displayName} description="Edit employee" />
      <EmployeeForm
        employee={employee}
        managers={everyone
          .filter((row) => row.id !== employee.id)
          .map((row) => ({ id: row.id, displayName: row.displayName }))}
        baseCurrency={entity.baseCurrency}
      />
    </>
  );
}
