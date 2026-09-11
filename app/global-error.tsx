'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const configuration =
    error.name === 'ConfigurationError' ||
    /password authentication failed|DATABASE_URL|not configured/i.test(error.message);

  return (
    <html lang="en">
      <body>
        <main className="signin">
          <div className="signin__panel">
            <h1 style={{ fontSize: '1.05rem', marginBottom: 8 }}>
              {configuration ? 'Cannot reach the database' : 'Something went wrong'}
            </h1>
            <p>
              {configuration
                ? 'DATABASE_URL on this host is missing or still contains ${...}. Put the skyjet_app_login password in the URL itself, then redeploy.'
                : 'The application failed to start. Try again, and tell an administrator if it keeps happening.'}
            </p>
            <div className="button-row" style={{ marginTop: 20 }}>
              <button type="button" onClick={() => reset()}>
                Try again
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
