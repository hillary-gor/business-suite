'use client';

import { useRouter } from 'next/navigation';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

export function PoListRow({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  function open() {
    router.push(href);
  }

  function onClick(event: MouseEvent<HTMLTableRowElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('a, button, input, textarea, select, label, .row-action')) return;
    open();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    open();
  }

  return (
    <tr className="po-list-row" tabIndex={0} onClick={onClick} onKeyDown={onKeyDown}>
      {children}
    </tr>
  );
}
