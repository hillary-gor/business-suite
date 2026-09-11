'use client';

import { useState, useTransition } from 'react';
import { getLibraryDocumentPersonAction } from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { LibraryDialog } from '@/app/library/library-dialog';
import type { LibraryColleague } from '@/server/modules/library/types';

export function LibraryPersonName({
  documentId,
  personId,
  name,
  preview = null,
}: {
  documentId: string;
  personId: string | null;
  name: string | null;
  preview?: LibraryColleague | null;
}) {
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<LibraryColleague | null>(preview);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!name) return <span>—</span>;
  if (!personId) return <span>{name}</span>;

  function show() {
    setError(null);
    setOpen(true);
    if (person || !personId) return;
    startTransition(async () => {
      const result = await getLibraryDocumentPersonAction(documentId, personId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPerson(result.data.person);
    });
  }

  return (
    <>
      <button type="button" className="library-person-link" onClick={show}>
        {name}
      </button>
      {open ? (
        <LibraryDialog title={person?.fullName ?? name} onClose={() => setOpen(false)}>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {pending && !person ? <p className="cell-muted">Loading…</p> : null}
          {person ? (
            <dl className="library-person">
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${person.email}`}>{person.email}</a>
                </dd>
              </div>
              <div>
                <dt>Job title</dt>
                <dd>{person.jobTitle || '—'}</dd>
              </div>
            </dl>
          ) : null}
          <p className="cell-muted">
            Anyone who can open this file can see this workplace card. It is not the People admin
            page, and it does not include a phone number.
          </p>
        </LibraryDialog>
      ) : null}
    </>
  );
}
