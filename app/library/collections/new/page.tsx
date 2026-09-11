import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { PageHeader } from '@/components/ui';
import { LibraryCollectionForm } from '../collection-form';

export const metadata = { title: 'New collection · Skyjet Library' };

export default async function NewLibraryCollectionPage() {
  await authorise(Permission.LibraryDocumentManage, { module: PlatformModule.Library });

  return (
    <>
      <PageHeader
        title="New collection"
        description="A folder for mixed types. Do not invent one per category — those already exist."
      />
      <LibraryCollectionForm />
    </>
  );
}
