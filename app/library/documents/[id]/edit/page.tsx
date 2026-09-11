import { notFound } from 'next/navigation';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getLibraryDocument } from '@/server/modules/library/queries';
import { PageHeader } from '@/components/ui';
import { assignableClassifications } from '@/app/library/access';
import { LibraryEditForm } from './edit-form';

export const metadata = { title: 'Edit document · Skyjet Library' };

export default async function LibraryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { context, session, entity } = await authorise(Permission.LibraryDocumentManage, {
    module: PlatformModule.Library,
  });

  let document;
  try {
    document = await getLibraryDocument(context, id);
  } catch {
    notFound();
  }

  if (!document.canOpen) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${document.title}`}
        description="Metadata only. Replace the file from the document page."
      />
      <LibraryEditForm
        document={document}
        allowedClassifications={assignableClassifications(session, entity.entityId)}
      />
    </>
  );
}
