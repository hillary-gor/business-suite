import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { moduleDefinition, PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise, can, canAccessModule, getSession, resolveEntity } from '@/server/auth/session';
import { ModuleLocked } from '@/components/platform/module-locked';
import { SignOutButton } from '@/components/platform/sign-out-button';
import { loadLibraryChrome } from '@/server/modules/library/queries';
import { assignableClassifications } from './access';
import { LibraryChrome } from './library-chrome';

export default async function LibraryLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=/library');

  if (session.entities.length === 0) {
    return (
      <main className="workspace">
        <div className="workspace__panel">
          <p>Your account exists but has not been granted a role in any organisation.</p>
          <SignOutButton />
        </div>
      </main>
    );
  }

  const entity = await resolveEntity(session);
  if (!canAccessModule(session, entity.entityId, PlatformModule.Library)) {
    return <ModuleLocked module={PlatformModule.Library} entityName={entity.name} />;
  }

  const { context } = await authorise(Permission.LibraryDocumentRead, {
    module: PlatformModule.Library,
  });
  const { categories, collections, notifications, profile } = await loadLibraryChrome(context);

  const mayUpload = can(session, entity.entityId, Permission.LibraryDocumentUpload);
  const mayCompany = can(session, entity.entityId, Permission.SettingsManage);
  const mayUsers = can(session, entity.entityId, Permission.UsersManage);
  const mayAccess = can(session, entity.entityId, Permission.LibraryAccessRead);
  const initials = session.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <Suspense>
      <LibraryChrome
        productName={moduleDefinition(PlatformModule.Library).name}
        entityName={entity.name}
        entities={session.entities.map((entry) => ({
          entityId: entry.entityId,
          code: entry.code,
          name: entry.name,
        }))}
        currentEntityId={entity.entityId}
        fullName={session.fullName}
        initials={initials}
        email={session.email}
        profile={profile}
        categories={categories.map((category) => ({
          code: category.code,
          name: category.name,
          count: category.documentCount,
        }))}
        collections={collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          count: collection.documentCount,
        }))}
        mayUpload={mayUpload}
        allowedClassifications={assignableClassifications(session, entity.entityId)}
        mayCompany={mayCompany}
        mayUsers={mayUsers}
        mayAccess={mayAccess}
        userId={session.userId}
        notifications={notifications}
      >
        {children}
      </LibraryChrome>
    </Suspense>
  );
}
