'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { markLibraryNotificationReadAction } from '@/server/actions/library-organize';
import type { LibraryNotification } from '@/server/modules/library/types';
import { IconBell } from '@/app/library/library-icons';
import { LibraryStamp } from '@/app/library/library-stamp';

function fromRealtime(row: Record<string, unknown>): LibraryNotification | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const kind = row.kind;
  if (!id) return null;
  if (
    kind !== 'access_requested' &&
    kind !== 'access_approved' &&
    kind !== 'access_denied' &&
    kind !== 'comment_added' &&
    kind !== 'document_shared'
  ) {
    return null;
  }
  return {
    id,
    kind,
    title: typeof row.title === 'string' ? row.title : 'Notice',
    body: typeof row.body === 'string' ? row.body : null,
    href: typeof row.href === 'string' ? row.href : null,
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  };
}

export function LibraryNotifications({
  userId,
  entityId,
  initial,
}: {
  userId: string;
  entityId: string;
  initial: readonly LibraryNotification[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LibraryNotification[]>(() => [...initial]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems([...initial]);
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserClient(url, key);
    const channel = supabase
      .channel(`library-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'library',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row || typeof row.id !== 'string') return;
          if (typeof row.entity_id === 'string' && row.entity_id !== entityId) return;

          setItems((current) => {
            const existing = current.find((item) => item.id === row.id);
            if (payload.eventType === 'UPDATE' && existing) {
              return current.map((item) =>
                item.id === row.id
                  ? {
                      ...item,
                      readAt:
                        row.read_at === null
                          ? null
                          : typeof row.read_at === 'string'
                            ? row.read_at
                            : item.readAt,
                    }
                  : item,
              );
            }
            const next = fromRealtime(row);
            if (!next) return current;
            return [next, ...current.filter((item) => item.id !== next.id)].slice(0, 40);
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [entityId, userId]);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  function markRead(notification: LibraryNotification) {
    if (notification.readAt) return;
    setItems((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    startTransition(async () => {
      await markLibraryNotificationReadAction(notification.id);
      router.refresh();
    });
  }

  return (
    <div className="library-bell" ref={rootRef}>
      <button
        type="button"
        className="library-bell__button"
        aria-expanded={open}
        aria-controls="library-notifications"
        onClick={() => setOpen((value) => !value)}
      >
        <IconBell />
        <span className="sr-only">Notifications</span>
        {unread > 0 ? (
          <span className="library-bell__count">{unread > 9 ? '9+' : String(unread)}</span>
        ) : null}
      </button>
      {open ? (
        <div
          id="library-notifications"
          className="library-bell__panel"
          role="region"
          aria-label="Notifications"
        >
          <p className="library-bell__head">Notifications</p>
          {items.length === 0 ? (
            <p className="library-bell__empty">No notices yet.</p>
          ) : (
            <ul className="library-bell__list">
              {items.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className={
                        item.readAt ? 'library-bell__item' : 'library-bell__item is-unread'
                      }
                      onClick={() => {
                        markRead(item);
                        setOpen(false);
                      }}
                    >
                      <span className="library-bell__title">{item.title}</span>
                      {item.body ? <span className="library-bell__body">{item.body}</span> : null}
                      <span className="library-bell__time">
                        <LibraryStamp value={item.createdAt} />
                      </span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={
                        item.readAt ? 'library-bell__item' : 'library-bell__item is-unread'
                      }
                      onClick={() => markRead(item)}
                      disabled={pending}
                    >
                      <span className="library-bell__title">{item.title}</span>
                      {item.body ? <span className="library-bell__body">{item.body}</span> : null}
                      <span className="library-bell__time">
                        <LibraryStamp value={item.createdAt} />
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
