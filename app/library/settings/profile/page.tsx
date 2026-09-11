import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { PageHeader } from '@/components/ui';
import { getOwnProfile } from '@/server/modules/settings/users';
import { LibraryProfileForm } from '@/app/library/library-profile-form';

export const metadata = { title: 'Profile · Skyjet Library' };

export default async function LibraryProfilePage() {
  const { context } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });
  const profile = await getOwnProfile(context);

  return (
    <>
      <PageHeader
        title="Profile settings"
        description="Your name and contact details in Skyjet. The password is the same one you use to sign in."
      />
      <LibraryProfileForm profile={profile} />
    </>
  );
}
