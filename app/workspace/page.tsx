import { redirect } from 'next/navigation';
import { PLATFORM_MODULE_CATALOG, PlatformModule } from '@/lib/platform/modules';
import { greetingForHour } from '@/lib/platform/greeting';
import { canAccessModule, getSession, resolveEntity } from '@/server/auth/session';
import { Alert } from '@/components/ui';
import { EntityPicker } from '@/components/platform/entity-picker';
import { SignOutButton } from '@/components/platform/sign-out-button';
import { WorkspaceModuleCard } from '@/components/platform/workspace-card';

export const metadata = { title: 'Workspace' };

export default async function WorkspacePage() {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=/workspace');

  if (session.entities.length === 0) {
    return (
      <main className="workspace">
        <div className="workspace__panel">
          <Alert tone="warning" title="No organisation access">
            Your account exists but has not been granted a role in any organisation. Someone who can
            manage users needs to assign you one before you can use the system.
          </Alert>
          <SignOutButton />
        </div>
      </main>
    );
  }

  const entity = await resolveEntity(session);
  const firstName = session.fullName.split(' ')[0];
  const greeting = greetingForHour(new Date().getHours());
  const modules = [...PLATFORM_MODULE_CATALOG].sort((left, right) => {
    if (left.code === PlatformModule.Library) return -1;
    if (right.code === PlatformModule.Library) return 1;
    return 0;
  });

  return (
    <main className="workspace">
      <div className="workspace__intro">
        {session.entities.length > 1 ? (
          <EntityPicker
            className="workspace-org"
            label="Organisation"
            hideLabel
            entities={session.entities.map((entry) => ({
              entityId: entry.entityId,
              code: entry.code,
              name: entry.name,
            }))}
            current={entity.entityId}
          />
        ) : (
          <p className="workspace__kicker">{entity.name}</p>
        )}
        <h1>
          {greeting}, {firstName}
        </h1>
        <p>
          Choose where to work. Skyjet Library holds the aircraft documents; Skyjet Business Suite
          holds the ledgers. Same login, same organisation.
        </p>
      </div>

      <div className="workspace__grid">
        {modules.map((module) => (
          <WorkspaceModuleCard
            key={module.code}
            module={module}
            enabled={canAccessModule(session, entity.entityId, module.code)}
          />
        ))}
      </div>

      <p className="workspace__foot">You can return here from either module at any time.</p>
    </main>
  );
}
