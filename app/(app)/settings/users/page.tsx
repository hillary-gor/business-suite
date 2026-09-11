import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAssignableRoles, listEntityUsers } from '@/server/modules/settings/users';
import { Card, PageHeader } from '@/components/ui';
import { UsersManager } from './users-manager';

export const metadata = { title: 'Manage users · SkyJet' };

export default async function ManageUsersPage() {
  const { context, session } = await authorise(Permission.UsersManage);
  const [people, roles] = await Promise.all([listEntityUsers(context), listAssignableRoles(context)]);

  return (
    <>
      <PageHeader
        title="Manage users"
        description="Invite people by email. They set a password from the message and then sign in with that address."
      />
      <Card>
        <UsersManager currentUserId={session.userId} people={people} roles={roles} />
      </Card>
    </>
  );
}
