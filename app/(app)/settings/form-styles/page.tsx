import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { getDocumentLayout } from '@/server/actions/document-layout';
import type { DocumentLayout, DocumentType } from '@/lib/document-layout';
import { DOCUMENT_TYPES } from '@/lib/document-layout';
import { Card, PageHeader } from '@/components/ui';
import { FormStylesEditor } from './form-styles-editor';

export const metadata = { title: 'Custom form styles · SkyJet' };

export default async function FormStylesPage() {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const allowed =
    can(session, entity.entityId, Permission.SettingsManage) ||
    can(session, entity.entityId, Permission.SalesInvoiceCreate);
  if (!allowed) {
    throw new PermissionDeniedError(
      'You do not have permission to do that (settings.manage or sales.invoice.create required)',
    );
  }

  const layouts = Object.fromEntries(
    await Promise.all(
      DOCUMENT_TYPES.map(async (item) => [item.id, await getDocumentLayout(item.id)] as const),
    ),
  ) as Record<DocumentType, DocumentLayout>;

  return (
    <>
      <PageHeader
        title="Custom form styles"
        description="Choose which fields appear on invoices, sales receipts, estimates, orders and credit notes, and rename column labels."
      />
      <Card>
        <FormStylesEditor layouts={layouts} />
      </Card>
    </>
  );
}
