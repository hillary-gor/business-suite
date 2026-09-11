'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setPasswordAction } from '@/server/actions/auth';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await setPasswordAction({ password, confirm });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/workspace');
    router.refresh();
  }

  return (
    <form className="signin__form" onSubmit={submit} noValidate>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Password" htmlFor="new-password" required>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={busy}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm-password" required>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={busy}
        />
      </Field>
      <button type="submit" className="button button--primary signin__submit" disabled={busy}>
        {busy ? <DotsLoader label="Saving" tone="inverse" /> : 'Save password'}
      </button>
    </form>
  );
}
