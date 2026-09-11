import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { listAdjustments } from '@/server/modules/inventory/lists';
import { PageHeader } from '@/components/ui';
import { PageFeedback } from '@/components/lists/list-chrome';
import { InventoryTabs } from '../inventory-tabs';
import { AdjustmentsTable } from './adjustments-table';

export const metadata = { title: 'Inventory adjustments · SkyJet' };

export default async function InventoryAdjustmentsPage() {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };

  const mayRead = can(session, entity.entityId, Permission.InvRead);
  const mayAdjust = can(session, entity.entityId, Permission.InvAdjustStock);
  if (!mayRead && !mayAdjust) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (inv.read or inv.adjust_stock required)',
    );
  }

  const rows = await listAdjustments(context);

  return (
    <>
      <PageHeader
        title="Inventory"
        actions={
          <>
            <PageFeedback />
            {mayAdjust ? (
              <Link href="/inventory/adjustments/new" className="button button--primary">
                New adjustment
              </Link>
            ) : null}
          </>
        }
      />
      <InventoryTabs active="adjustments" />
      <AdjustmentsTable rows={rows} />
    </>
  );
}
