import Link from 'next/link';
import { moduleDefinition, type PlatformModuleCode } from '@/lib/platform/modules';
import { Alert } from '@/components/ui';
import { SignOutButton } from '@/components/platform/sign-out-button';
import { WorkspaceSwitch } from '@/components/platform/workspace-switch';

export function ModuleLocked({
  module,
  entityName,
}: {
  module: PlatformModuleCode;
  entityName: string;
}) {
  const definition = moduleDefinition(module);

  return (
    <main className="workspace">
      <div className="workspace__panel">
        <p className="workspace__kicker">{entityName}</p>
        <h1>This area is locked</h1>
        <Alert tone="warning" title={`${definition.name} is not available`}>
          Your organisation does not currently have access. You are still signed in.
        </Alert>
        <div className="button-row" style={{ marginTop: 20 }}>
          <WorkspaceSwitch className="button button--primary" />
          <SignOutButton />
        </div>
        <p className="text-small" style={{ marginTop: 16, color: 'var(--ink-subtle)' }}>
          Ask someone who administers this organisation to enable {definition.name}, or{' '}
          <Link href="/workspace">return to the workspace</Link>.
        </p>
      </div>
    </main>
  );
}
