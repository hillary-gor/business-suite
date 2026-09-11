import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';

export default async function CustomerHubLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  if (
    !can(session, entity.entityId, Permission.MastersManageCustomers) &&
    !can(session, entity.entityId, Permission.SalesInvoiceCreate)
  ) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (masters.manage_customers or sales.invoice.create required)',
    );
  }
  return children;
}
