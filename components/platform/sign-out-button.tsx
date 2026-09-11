'use client';

import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { ReactNode } from 'react';

export function SignOutButton({
  className,
  children = 'Sign out',
}: {
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className ?? 'button--ghost button--small'}
      onClick={async () => {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL as string,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        );
        await supabase.auth.signOut();
        router.replace('/sign-in');
        router.refresh();
      }}
    >
      {children}
    </button>
  );
}
