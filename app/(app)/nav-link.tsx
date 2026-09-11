'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pathIsActive } from './nav-model';

/**
 * A navigation link that knows whether it is the current page.
 *
 * `aria-current` rather than a class name, so assistive technology and the
 * stylesheet both learn about the current page from the same attribute.
 */
export function NavLink({
  href,
  children,
  disabled = false,
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const isCurrent = pathIsActive(pathname, href);

  if (disabled) {
    return (
      <a data-disabled="true" aria-disabled="true" title="Not yet built">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} aria-current={isCurrent ? 'page' : undefined}>
      {children}
    </Link>
  );
}
