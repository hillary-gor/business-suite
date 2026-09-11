'use client';

/**
 * Sign in.
 *
 * Authentication is Supabase's, called from the browser so the session cookie
 * is established by its own SDK. This component holds no credentials and makes
 * no authorisation decision: what the user may then do is decided entirely on
 * the server, from their roles in the database.
 *
 * The failure message is deliberately identical for a wrong password and an
 * unknown address. Distinguishing them would let anyone enumerate who has an
 * account here.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';

export function SignInForm({ nextPath, reason }: { nextPath: string; reason?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === 'configuration'
      ? 'The application is not configured correctly. Contact your administrator.'
      : null,
  );
  const [pending, startTransition] = useTransition();
  const [signingIn, setSigningIn] = useState(false);
  const busy = pending || signingIn;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    setSigningIn(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setSigningIn(false);
      setError('That email address and password do not match an active account.');
      return;
    }

    startTransition(() => {
      router.replace(nextPath);
      router.refresh();
    });
  }

  return (
    <form className="signin__form" onSubmit={handleSubmit} noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Field label="Email address" htmlFor="email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </Field>

      <div className="field">
        <div className="signin__password-head">
          <label htmlFor="password">
            Password
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          </label>
          <Link href="/auth/forgot-password">Forgot password?</Link>
        </div>
        <div className="signin__secret">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="signin__reveal"
            onClick={() => setShowPassword((open) => !open)}
            disabled={busy}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <button type="submit" className="button button--primary signin__submit" disabled={busy}>
        {busy ? <DotsLoader label="Signing in" tone="inverse" /> : 'Sign in'}
      </button>
    </form>
  );
}
