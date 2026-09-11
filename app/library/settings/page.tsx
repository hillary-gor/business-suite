import Link from 'next/link';
import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { PageHeader } from '@/components/ui';
import { LIBRARY_GUIDE_HREF } from '@/app/library/guide';
import { LibraryGuideLinks } from '@/app/library/library-guide-links';

export const metadata = { title: 'Settings · Skyjet Library' };

export default async function LibrarySettingsPage() {
  const { session, entity } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });

  const mayCompany = can(session, entity.entityId, Permission.SettingsManage);
  const mayUsers = can(session, entity.entityId, Permission.UsersManage);
  const mayAccess = can(session, entity.entityId, Permission.LibraryAccessRead);

  return (
    <>
      <PageHeader
        title="Library settings"
        description="Your profile, organisation identity, who can sign in, and who opened which file. Company and users are the same directory as the rest of Skyjet."
      />
      <LibraryGuideLinks lead="Learn the catalogue, clearance and search before you change settings." />

      <div className="library-tiles">
        <Link href={LIBRARY_GUIDE_HREF} className="library-tile">
          <span className="library-tile__name">How Library works</span>
          <span className="library-tile__desc">
            What Library is, who can open a file, and how to search, upload and request access.
          </span>
        </Link>
        <Link href="/library/settings/profile" className="library-tile">
          <span className="library-tile__name">Profile</span>
          <span className="library-tile__desc">Your name, job title, phone and password.</span>
        </Link>
        {mayCompany ? (
          <Link href="/library/settings/company" className="library-tile">
            <span className="library-tile__name">Organisation</span>
            <span className="library-tile__desc">
              Legal name, trading name, address and contact.
            </span>
          </Link>
        ) : null}
        {mayUsers ? (
          <Link href="/library/settings/users" className="library-tile">
            <span className="library-tile__name">People</span>
            <span className="library-tile__desc">
              Invite users and assign the role that sets their Library clearance.
            </span>
          </Link>
        ) : null}
        {mayAccess ? (
          <Link href="/library/settings/access" className="library-tile">
            <span className="library-tile__name">Access log</span>
            <span className="library-tile__desc">Who opened or downloaded files, and when.</span>
          </Link>
        ) : null}
      </div>
    </>
  );
}
