'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeOwnPasswordAction, updateOwnProfileAction } from '@/server/actions/settings';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import type { OwnProfile } from '@/server/modules/settings/users';

export function LibraryProfileForm({
  profile,
  onSaved,
}: {
  profile: OwnProfile;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    setError(null);
    setMessage(null);
    setFields({});
    startTransition(async () => {
      const profileResult = await updateOwnProfileAction({
        fullName: String(data.get('fullName') ?? ''),
        jobTitle: String(data.get('jobTitle') ?? ''),
        phone: String(data.get('phone') ?? ''),
      });
      if (!profileResult.ok) {
        setError(profileResult.error);
        setFields(profileResult.fields ?? {});
        return;
      }
      if (password || confirm) {
        const passwordResult = await changeOwnPasswordAction({ password, confirm });
        if (!passwordResult.ok) {
          setError(passwordResult.error);
          setFields(passwordResult.fields ?? {});
          return;
        }
        setMessage('Profile and password saved.');
      } else {
        setMessage(profileResult.message ?? 'Profile saved.');
      }
      router.refresh();
      onSaved?.();
    });
  }

  return (
    <form className="library-form" onSubmit={onSubmit}>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      <Field
        label="Email"
        htmlFor="email"
        hint="Managed by sign-in. Ask an administrator to change it."
      >
        <input id="email" type="email" value={profile.email} disabled />
      </Field>

      <Field label="Full name" htmlFor="fullName" required error={fields.fullName}>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          maxLength={120}
          defaultValue={profile.fullName}
          disabled={pending}
        />
      </Field>

      <div className="form-grid">
        <Field label="Job title" htmlFor="jobTitle" error={fields.jobTitle}>
          <input
            id="jobTitle"
            name="jobTitle"
            type="text"
            maxLength={120}
            defaultValue={profile.jobTitle ?? ''}
            disabled={pending}
          />
        </Field>
        <Field label="Phone" htmlFor="phone" error={fields.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            maxLength={40}
            defaultValue={profile.phone ?? ''}
            disabled={pending}
          />
        </Field>
      </div>

      <Field
        label="New password"
        htmlFor="password"
        hint="Leave blank to keep the current password."
        error={fields.password}
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          disabled={pending}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fields.confirm}>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          disabled={pending}
        />
      </Field>

      <div className="button-row">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? <DotsLoader label="Saving" tone="inverse" /> : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
