'use client';

import { useState } from 'react';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/server/actions/auth';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { AuthShell } from '@/components/platform/auth-shell';
import { PlatformAuthBrand } from '@/components/platform/auth-brand';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await requestPasswordResetAction({ email });
    setBusy(false);
    setMessage(result.message);
  }

  return (
    <AuthShell>
      <PlatformAuthBrand
        title="Reset your password"
        description="Enter the email address for your Skyjet account. If it exists, we will send a link."
      />
      <form className="signin__form" onSubmit={submit} noValidate>
        {message ? <Alert tone="success">{message}</Alert> : null}
        <Field label="Email address" htmlFor="email" required>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
            required
          />
        </Field>
        <button type="submit" className="button button--primary signin__submit" disabled={busy}>
          {busy ? <DotsLoader label="Sending" tone="inverse" /> : 'Send link'}
        </button>
      </form>
      <p className="signin__back">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
