'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  decideLibraryDocumentAccessAction,
  requestLibraryDocumentAccessAction,
} from '@/server/actions/library-organize';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import type { LibraryAccessRequest } from '@/server/modules/library/types';
import { LibraryStamp } from '@/app/library/library-stamp';

export function LibraryRequestAccessForm({
  documentId,
  existing,
}: {
  documentId: string;
  existing: LibraryAccessRequest | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing?.status === 'pending') {
    return (
      <p className="cell-muted">
        Request sent <LibraryStamp value={existing.createdAt} />. A manager will be notified.
      </p>
    );
  }

  return (
    <form
      className="library-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const reason = String(new FormData(form).get('reason') ?? '');
        setError(null);
        startTransition(async () => {
          const result = await requestLibraryDocumentAccessAction(documentId, reason);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          form.reset();
          router.refresh();
        });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {existing?.status === 'denied' ? (
        <p>The last request was refused. You can ask again if the need has changed.</p>
      ) : (
        <p>You can see that this file exists. Opening it needs a manager to grant you this file.</p>
      )}
      <Field label="Reason" htmlFor="access-reason" hint="Optional. 400 characters at most.">
        <textarea id="access-reason" name="reason" rows={3} maxLength={400} disabled={pending} />
      </Field>
      <div className="button-row">
        <button type="submit" className="button button--primary" disabled={pending}>
          {pending ? <DotsLoader label="Sending" tone="inverse" /> : 'Request access'}
        </button>
      </div>
    </form>
  );
}

export function LibraryAccessRequestQueue({
  documentId,
  requests,
}: {
  documentId: string;
  requests: readonly LibraryAccessRequest[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const open = requests.filter((row) => row.status === 'pending');
  const decided = requests.filter((row) => row.status !== 'pending').slice(0, 8);

  function decide(requestId: string, approve: boolean) {
    setError(null);
    setBusyId(requestId);
    startTransition(async () => {
      const result = await decideLibraryDocumentAccessAction(documentId, requestId, approve);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (requests.length === 0) {
    return <p className="cell-muted">No access requests for this file.</p>;
  }

  return (
    <div className="library-request-queue">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {open.length === 0 ? (
        <p className="cell-muted">No pending requests.</p>
      ) : (
        <ul className="library-request-queue__list">
          {open.map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.requesterName || 'Someone'}</strong>
                <span className="cell-muted">
                  {' · '}
                  <LibraryStamp value={row.createdAt} />
                </span>
                {row.reason ? <p>{row.reason}</p> : null}
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="button button--primary button--small"
                  disabled={pending}
                  onClick={() => decide(row.id, true)}
                >
                  {pending && busyId === row.id ? (
                    <DotsLoader label="Saving" tone="inverse" />
                  ) : (
                    'Allow'
                  )}
                </button>
                <button
                  type="button"
                  className="button button--small"
                  disabled={pending}
                  onClick={() => decide(row.id, false)}
                >
                  Refuse
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 ? (
        <ul className="library-request-queue__history">
          {decided.map((row) => (
            <li key={row.id}>
              {row.requesterName || 'Someone'} · {row.status} ·{' '}
              <LibraryStamp value={row.createdAt} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
