'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const configuration =
    error.name === 'ConfigurationError' ||
    /password authentication failed|DATABASE_URL|not configured/i.test(error.message);

  return (
    <main className="signin">
      <div className="signin__panel">
        <h1 style={{ fontSize: '1.05rem', marginBottom: 8 }}>
          {configuration ? 'Cannot reach the database' : 'Something went wrong'}
        </h1>
        <p className="text-muted">
          {configuration
            ? 'The application refused to run rather than connect with the wrong credentials. An administrator needs to set DATABASE_URL on this host to the skyjet_app_login connection string, with the password written into the URL — Vercel does not expand ${SKYJET_APP_PASSWORD}.'
            : 'The page failed to load. Try again, and tell an administrator if it keeps happening.'}
        </p>
        <div className="button-row" style={{ marginTop: 20 }}>
          <button type="button" className="button button--primary" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
