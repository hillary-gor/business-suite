import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { PageHeader } from '@/components/ui';
import { assignableClassifications } from '@/app/library/access';
import { LibraryUploadForm } from './upload-form';

export const metadata = { title: 'Upload · Skyjet Library' };

export default async function LibraryUploadPage() {
  const { session, entity } = await authorise(Permission.LibraryDocumentUpload, {
    module: PlatformModule.Library,
  });

  return (
    <>
      <PageHeader
        title="Upload document"
        description="Store a manual, certificate or technical file for this organisation. Files stay in Skyjet Library — they are not mixed with Skyjet Business Suite attachments. Access level is enforced, not decorative."
      />
      <LibraryUploadForm
        allowedClassifications={assignableClassifications(session, entity.entityId)}
      />
    </>
  );
}
