import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';

export function HubFeatureEmpty({
  title,
  lede,
  children,
  actions,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={lede}
        actions={
          <Link href="/customers" className="button">
            Back to overview
          </Link>
        }
      />
      <section className="hub-feature">
        {children}
        {actions ? <div className="button-row">{actions}</div> : null}
      </section>
    </>
  );
}
