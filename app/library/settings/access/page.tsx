import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listLibraryAccessEvents } from '@/server/modules/library/queries';
import { Card, PageHeader } from '@/components/ui';
import { LibraryAccessTable } from '@/app/library/access-table';

export const metadata = { title: 'Access log · Skyjet Library' };

export default async function LibraryAccessLogPage() {
  const { context } = await authorise(Permission.LibraryAccessRead, {
    module: PlatformModule.Library,
  });
  const events = await listLibraryAccessEvents(context, undefined, 200);

  return (
    <>
      <PageHeader
        title="Access log"
        description="Who opened document details, previewed a file, or downloaded it. Row changes (upload, edit, delete) remain on the organisation audit log."
      />
      <Card>
        <LibraryAccessTable events={events} showDocument />
      </Card>
    </>
  );
}
