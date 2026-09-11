'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locked =
    error.name === 'ModuleNotEntitledError' ||
    /organisation does not currently have access/i.test(error.message ?? '');
  const denied =
    !locked && (error.name === 'PermissionDeniedError' || /permission/i.test(error.message ?? ''));

  return (
    <>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 8 }}>
        {locked
          ? 'This area is locked'
          : denied
            ? 'You do not have permission to do that'
            : 'Something went wrong'}
      </h1>
      <p className="text-muted">
        {locked
          ? error.message ||
            'Your organisation does not currently have access. You are still signed in.'
          : denied
            ? error.message ||
              'Your role does not include this screen. Use the menu to open an area you can work in.'
            : 'The page failed to load. Try again, and tell an administrator if it keeps happening.'}
      </p>
      <div className="button-row" style={{ marginTop: 20 }}>
        {locked ? (
          <Link href="/workspace" className="button button--primary">
            Switch workspace
          </Link>
        ) : (
          <button type="button" className="button button--primary" onClick={() => reset()}>
            Try again
          </button>
        )}
      </div>
    </>
  );
}
