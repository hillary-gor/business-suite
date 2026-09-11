import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAssignableRoles, listEntityUsers } from '@/server/modules/settings/users';
import { LIBRARY_ROLE_CLEARANCE } from '@/server/modules/library/types';
import { Card, DataTable, PageHeader } from '@/components/ui';
import { UsersManager } from '@/app/(app)/settings/users/users-manager';

export const metadata = { title: 'People · Skyjet Library' };

export default async function LibraryUsersPage() {
  const { context, session } = await authorise(Permission.UsersManage, {
    module: PlatformModule.Library,
  });
  const [people, roles] = await Promise.all([
    listEntityUsers(context),
    listAssignableRoles(context),
  ]);

  return (
    <>
      <PageHeader
        title="People"
        description="Role sets Library clearance: viewers see Internal only; confidential and restricted need the matching permissions. This is the same user list as Business Suite."
      />
      <Card title="Library clearance by role">
        <p className="cell-muted">
          These are the same organisation roles as Business Suite. Library does not have a separate
          user directory. Clearance is the permission on the role, not a badge on the file.
        </p>
        <DataTable>
          <thead>
            <tr>
              <th>Role</th>
              <th>Can open</th>
              <th>Access log</th>
            </tr>
          </thead>
          <tbody>
            {LIBRARY_ROLE_CLEARANCE.map((row) => (
              <tr key={row.roles}>
                <td>{row.roles}</td>
                <td>{row.access}</td>
                <td>{row.audit}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
      <Card>
        <UsersManager currentUserId={session.userId} people={people} roles={roles} />
      </Card>
    </>
  );
}
