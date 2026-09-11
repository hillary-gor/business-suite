'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type MouseEvent } from 'react';
import { PlatformModule, type PlatformModuleDefinition } from '@/lib/platform/modules';
import { WorkspaceModuleArt } from '@/components/platform/workspace-art';
import { SuitePrototypeNotice } from '@/components/platform/suite-prototype-notice';
import { acknowledgeSuitePrototype } from '@/lib/suite-prototype';

export function WorkspaceModuleCard({
  module,
  enabled,
}: {
  module: PlatformModuleDefinition;
  enabled: boolean;
}) {
  const router = useRouter();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const isLibrary = module.code === PlatformModule.Library;
  const isSuite = module.code === PlatformModule.BusinessSuite;
  const className = [
    'workspace-card',
    isLibrary ? 'workspace-card--library' : 'workspace-card--suite',
    enabled ? '' : 'workspace-card--locked',
  ]
    .filter(Boolean)
    .join(' ');
  const titleId = `workspace-${module.code}-title`;

  const openSuite = useCallback(() => {
    acknowledgeSuitePrototype();
    setNoticeOpen(false);
    router.push(module.href);
  }, [module.href, router]);

  const interceptSuite = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    setNoticeOpen(true);
  };

  const body = (
    <>
      <div className="workspace-card__art">
        <WorkspaceModuleArt module={module.code} />
      </div>
      <p className="workspace-card__eyebrow">{isLibrary ? 'Aircraft documents' : 'Operations'}</p>
      <h2 id={titleId}>{module.name}</h2>
      <p className="workspace-card__copy">{module.description}</p>
      <ul className="workspace-card__list">
        {module.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {enabled ? (
        <span className="workspace-card__cta">Open {module.name}</span>
      ) : (
        <p className="workspace-card__status">
          Locked — this organisation does not currently have access.
        </p>
      )}
    </>
  );

  if (enabled) {
    return (
      <>
        <Link
          href={module.href}
          className={className}
          aria-labelledby={titleId}
          onClick={isSuite ? interceptSuite : undefined}
        >
          {body}
        </Link>
        {noticeOpen ? <SuitePrototypeNotice onProceed={openSuite} /> : null}
      </>
    );
  }

  return (
    <section className={className} aria-labelledby={titleId} aria-disabled="true">
      {body}
    </section>
  );
}
