'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  listLibraryShareColleaguesAction,
  shareLibraryDocumentAction,
} from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryStamp } from '@/app/library/library-stamp';
import { LibraryPersonName } from './document-person';
import {
  LIBRARY_SHARE_CHANNEL_LABELS,
  type LibraryColleague,
  type LibraryDocumentShare,
  type LibraryShareChannel,
} from '@/server/modules/library/types';

const CHANNELS: Array<{ id: LibraryShareChannel; label: string; hint: string }> = [
  {
    id: 'internal',
    label: 'In Library',
    hint: 'They get a notice in the Library bell. Opening still follows their clearance.',
  },
  {
    id: 'email',
    label: 'Email',
    hint: 'Sends a sign-in link, not the file. They also get a Library notice.',
  },
  {
    id: 'link',
    label: 'Copy link',
    hint: 'Copies a Library link. Anyone who opens it must already be signed in.',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    hint: 'Opens WhatsApp with a sign-in link. The file itself is not sent.',
  },
];

function shareHref(documentId: string): string {
  return `${window.location.origin}/library/documents/${documentId}`;
}

export function LibraryDocumentShare({
  documentId,
  title,
  initial,
}: {
  documentId: string;
  title: string;
  initial: readonly LibraryDocumentShare[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<LibraryDocumentShare[]>(() => [...initial]);
  const [channel, setChannel] = useState<LibraryShareChannel>('internal');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<LibraryColleague[]>([]);
  const [selected, setSelected] = useState<LibraryColleague[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    setShares([...initial]);
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    startSearch(async () => {
      const result = await listLibraryShareColleaguesAction({
        documentId,
        query,
      });
      if (result.ok) setPeople(result.data.people);
    });
  }, [documentId, open, query]);

  const needsRecipient = channel === 'internal' || channel === 'email';
  const count = shares.length;
  const label = count === 0 ? 'Share' : `Share (${count})`;

  const selectedIds = useMemo(() => new Set(selected.map((person) => person.id)), [selected]);

  function togglePerson(person: LibraryColleague) {
    setSelected((current) =>
      current.some((row) => row.id === person.id)
        ? current.filter((row) => row.id !== person.id)
        : [...current, person],
    );
  }

  function share() {
    setError(null);
    setNotice(null);

    if (channel === 'link' || channel === 'whatsapp') {
      const href = shareHref(documentId);
      startTransition(async () => {
        if (channel === 'link') {
          try {
            await navigator.clipboard.writeText(href);
          } catch {
            setError('The link could not be copied. Check clipboard permission, then try again.');
            return;
          }
        }
        const result = await shareLibraryDocumentAction({
          documentId,
          channel,
          recipientUserId: null,
          note,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setShares(result.data.shares);
        setNotice(result.message ?? 'Recorded.');
        if (channel === 'whatsapp') {
          const text = `${title} — sign in to Skyjet Library to open this file:\n${href}`;
          window.open(
            `https://wa.me/?text=${encodeURIComponent(text)}`,
            '_blank',
            'noopener,noreferrer',
          );
        }
        router.refresh();
      });
      return;
    }

    if (selected.length === 0) {
      setError('Choose a colleague.');
      return;
    }

    startTransition(async () => {
      let latest = shares;
      const messages: string[] = [];
      for (const person of selected) {
        const result = await shareLibraryDocumentAction({
          documentId,
          channel,
          recipientUserId: person.id,
          note,
        });
        if (!result.ok) {
          setError(result.error);
          setShares(latest);
          return;
        }
        latest = result.data.shares;
        if (result.message) messages.push(result.message);
      }
      setShares(latest);
      setSelected([]);
      setNote('');
      setNotice(messages[messages.length - 1] ?? 'Shared.');
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <LibraryDialog title="Share this file" wide onClose={() => setOpen(false)}>
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Share with people in this organisation who can use Library. The file is never attached
            to email or WhatsApp. Opening still needs a Skyjet sign-in and the right clearance.
          </p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {notice ? <Alert tone="success">{notice}</Alert> : null}

          <div className="library-share-tabs" role="tablist" aria-label="How to share">
            {CHANNELS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={channel === item.id}
                className={
                  channel === item.id ? 'library-share-tab is-active' : 'library-share-tab'
                }
                onClick={() => {
                  setChannel(item.id);
                  setError(null);
                  setNotice(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="cell-muted">{CHANNELS.find((item) => item.id === channel)?.hint}</p>

          {needsRecipient ? (
            <>
              <label className="library-share-label" htmlFor="library-share-people">
                Colleague
              </label>
              <input
                id="library-share-people"
                type="search"
                value={query}
                placeholder="Search by name or email"
                disabled={pending}
                onChange={(event) => setQuery(event.target.value)}
              />
              {selected.length > 0 ? (
                <ul className="library-share-chips">
                  {selected.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        className="library-share-chip"
                        onClick={() => togglePerson(person)}
                      >
                        {person.fullName}
                        <span aria-hidden="true"> ×</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {searching && people.length === 0 ? (
                <p className="cell-muted">Looking up colleagues…</p>
              ) : people.filter((person) => !selectedIds.has(person.id)).length === 0 ? (
                <p className="cell-muted">No colleagues match that search.</p>
              ) : (
                <ul className="library-share-people">
                  {people
                    .filter((person) => !selectedIds.has(person.id))
                    .slice(0, 12)
                    .map((person) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="library-share-person"
                          disabled={pending}
                          onClick={() => togglePerson(person)}
                        >
                          <span className="library-share-person__name">{person.fullName}</span>
                          <span className="library-share-person__meta">
                            {person.email}
                            {person.jobTitle ? ` · ${person.jobTitle}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </>
          ) : null}

          <label className="library-share-label" htmlFor="library-share-note">
            Note (optional)
          </label>
          <textarea
            id="library-share-note"
            rows={2}
            maxLength={400}
            value={note}
            disabled={pending}
            onChange={(event) => setNote(event.target.value)}
          />

          <div className="button-row">
            <button
              type="button"
              className="button button--primary"
              disabled={pending || (needsRecipient && selected.length === 0)}
              onClick={share}
            >
              {pending ? (
                <DotsLoader label="Sharing" />
              ) : channel === 'link' ? (
                'Copy link'
              ) : channel === 'whatsapp' ? (
                'Share on WhatsApp'
              ) : channel === 'email' ? (
                'Send email'
              ) : (
                'Share in Library'
              )}
            </button>
          </div>

          <h3 className="library-share-trail__title">Who shared, when, and how</h3>
          <LibraryShareTrail documentId={documentId} shares={shares} />
        </LibraryDialog>
      ) : null}
    </>
  );
}

export function LibraryShareTrail({
  documentId,
  shares,
}: {
  documentId: string;
  shares: readonly LibraryDocumentShare[];
}) {
  if (shares.length === 0) {
    return <p className="cell-muted">This file has not been shared yet.</p>;
  }

  return (
    <ul className="library-share-trail">
      {shares.map((share) => (
        <li key={share.id} className="library-share-trail__item">
          <div className="library-share-trail__meta">
            <LibraryPersonName
              documentId={documentId}
              personId={share.sharedBy}
              name={share.sharedByName}
            />
            <span>{LIBRARY_SHARE_CHANNEL_LABELS[share.channel]}</span>
            <LibraryStamp value={share.createdAt} />
          </div>
          <p className="library-share-trail__to">
            {share.recipientUserId ? (
              <>
                To{' '}
                <LibraryPersonName
                  documentId={documentId}
                  personId={share.recipientUserId}
                  name={share.recipientName ?? share.recipientEmail}
                />
                {share.recipientEmail ? (
                  <span className="cell-muted"> · {share.recipientEmail}</span>
                ) : null}
              </>
            ) : (
              <span className="cell-muted">No named recipient</span>
            )}
            {share.grantedAccess ? (
              <span className="library-share-grant">Opened this file for them</span>
            ) : null}
          </p>
          {share.note ? <p className="library-share-trail__note">{share.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}
