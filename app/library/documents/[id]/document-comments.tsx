'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addLibraryDocumentCommentAction,
  toggleLibraryCommentReactionAction,
} from '@/server/actions/library-organize';
import { Alert } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import { LibraryDialog } from '@/app/library/library-dialog';
import { LibraryStamp } from '@/app/library/library-stamp';
import { LibraryPersonName } from './document-person';
import {
  LIBRARY_COMMENT_REACTIONS,
  type LibraryComment,
  type LibraryCommentReactionId,
} from '@/server/modules/library/types';

export function LibraryDocumentComments({
  documentId,
  initial,
}: {
  documentId: string;
  initial: readonly LibraryComment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<LibraryComment[]>(() => [...initial]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setComments([...initial]);
  }, [initial]);

  function addComment() {
    const next = body.trim();
    if (!next) return;
    setError(null);
    startTransition(async () => {
      const result = await addLibraryDocumentCommentAction({ documentId, body: next });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComments(result.data.comments);
      setBody('');
      router.refresh();
    });
  }

  function react(commentId: string, emoji: LibraryCommentReactionId) {
    setError(null);
    startTransition(async () => {
      const result = await toggleLibraryCommentReactionAction({
        documentId,
        commentId,
        emoji,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setComments(result.data.comments);
    });
  }

  const count = comments.length;
  const label = count === 0 ? 'Comments' : `Comments (${count})`;

  return (
    <>
      <button type="button" className="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? (
        <LibraryDialog title={label} wide onClose={() => setOpen(false)}>
          <p className="cell-muted" style={{ marginTop: 0 }}>
            Anyone who can open this file can read and add comments. The bell notifies the uploader
            and people already in this thread — not everyone who has viewed the file.
          </p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {comments.length === 0 ? (
            <p className="library-comments__empty">No comments yet. Add the first note.</p>
          ) : (
            <ul className="library-comments">
              {comments.map((comment) => (
                <li key={comment.id} className="library-comment">
                  <div className="library-comment__meta">
                    <LibraryPersonName
                      documentId={documentId}
                      personId={comment.authorId}
                      name={comment.authorName}
                    />
                    <LibraryStamp value={comment.createdAt} />
                  </div>
                  <p className="library-comment__body">{comment.body}</p>
                  <div className="library-comment__reactions">
                    {LIBRARY_COMMENT_REACTIONS.map((reaction) => {
                      const active = comment.mine.includes(reaction.id);
                      const n = comment.reactions[reaction.id];
                      return (
                        <button
                          key={reaction.id}
                          type="button"
                          className={active ? 'library-reaction is-on' : 'library-reaction'}
                          aria-pressed={active}
                          aria-label={reaction.label}
                          title={reaction.label}
                          disabled={pending}
                          onClick={() => react(comment.id, reaction.id)}
                        >
                          <span aria-hidden="true">{reaction.emoji}</span>
                          {n > 0 ? <span>{n}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form
            className="library-comment-form"
            onSubmit={(event) => {
              event.preventDefault();
              addComment();
            }}
          >
            <label htmlFor="library-comment-body">Add a comment</label>
            <textarea
              id="library-comment-body"
              rows={3}
              maxLength={2000}
              value={body}
              disabled={pending}
              onChange={(event) => setBody(event.target.value)}
            />
            <div className="button-row">
              <button
                type="submit"
                className="button button--primary"
                disabled={pending || body.trim().length === 0}
              >
                {pending ? <DotsLoader label="Posting" /> : 'Post comment'}
              </button>
            </div>
          </form>
        </LibraryDialog>
      ) : null}
    </>
  );
}
