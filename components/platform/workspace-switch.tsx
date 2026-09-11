import Link from 'next/link';
import type { ReactNode } from 'react';

export function WorkspaceSwitch({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href="/workspace" className={className ?? 'button button--ghost button--small'}>
      {children ?? 'Switch workspace'}
    </Link>
  );
}
