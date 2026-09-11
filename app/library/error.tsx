'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function LibraryErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const locked = error.name === 'ModuleNotEntitledError';
  const denied = error.name === 'PermissionDeniedError';

  return (
    <div className="library-error">
      <h1>
        {locked
          ? 'This area is locked'
          : denied
            ? 'You cannot do that'
            : 'The library failed to load'}
      </h1>
      <p className="text-muted">
        {error.message || 'Try again, and tell an administrator if it keeps happening.'}
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
    </div>
  );
}
