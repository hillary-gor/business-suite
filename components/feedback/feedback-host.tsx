'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { sendFeedbackAction } from '@/server/actions/settings';
import { Alert, Field } from '@/components/ui';
import { DotsLoader } from '@/components/loading/dots-loader';
import {
  FEEDBACK_TOPICS,
  feedbackPageTitle,
  type FeedbackScopeId,
  type FeedbackTopicId,
} from '@/lib/feedback';

type FeedbackApi = { open: () => void };

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const value = useContext(FeedbackContext);
  if (!value) {
    throw new Error('Give feedback needs FeedbackHost in the application shell.');
  }
  return value;
}

export function FeedbackHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  return (
    <FeedbackContext.Provider value={{ open: show }}>
      {children}
      {open ? <FeedbackDialog onClose={hide} /> : null}
    </FeedbackContext.Provider>
  );
}

export function FeedbackButton({
  className = 'page-feedback',
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const { open } = useFeedback();
  return (
    <button type="button" className={className} onClick={open}>
      {children ?? (
        <>
          <FeedbackGlyph />
          Give feedback
        </>
      )}
    </button>
  );
}

export function FeedbackGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H10l-4.5 3.5V16H7.5A2.5 2.5 0 0 1 5 13.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() || '/';
  const pageTitle = feedbackPageTitle(pathname);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [scope, setScope] = useState<FeedbackScopeId>('this_page');
  const [topic, setTopic] = useState<FeedbackTopicId>('bug');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const firstChoice = panelRef.current?.querySelector<HTMLInputElement>('input[type="radio"]');
    firstChoice?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFields({});
    startTransition(async () => {
      const result = await sendFeedbackAction({
        scope,
        topic,
        message,
        page: pathname,
        pageTitle,
      });
      if (!result.ok) {
        setError(result.error);
        setFields(result.fields ?? {});
        return;
      }
      setSaved(true);
      setMessage('');
    });
  }

  const dialog = (
    <>
      <button
        type="button"
        className="feedback-dialog__backdrop"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <header className="feedback-dialog__head">
          <div>
            <h2 id={titleId}>Give feedback</h2>
            <p className="feedback-dialog__where">
              You are on <strong>{pageTitle}</strong>
            </p>
          </div>
          <button type="button" className="button button--ghost button--small" onClick={onClose}>
            Close
          </button>
        </header>

        {saved ? (
          <Alert tone="success" title="Thanks">
            We have the message. A developer will reply to the email on your account.
          </Alert>
        ) : (
          <form className="feedback-dialog__form" onSubmit={submit}>
            {error ? (
              <Alert tone="danger" title="Could not send">
                {error}
              </Alert>
            ) : null}

            <fieldset className="feedback-dialog__scopes">
              <legend>What is this about?</legend>
              <label className={`feedback-dialog__scope${scope === 'this_page' ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="feedback-scope"
                  checked={scope === 'this_page'}
                  onChange={() => setScope('this_page')}
                />
                <span>
                  <strong>This page</strong>
                  <em>{pageTitle}</em>
                </span>
              </label>
              <label
                className={`feedback-dialog__scope${scope === 'something_else' ? ' is-on' : ''}`}
              >
                <input
                  type="radio"
                  name="feedback-scope"
                  checked={scope === 'something_else'}
                  onChange={() => setScope('something_else')}
                />
                <span>
                  <strong>Something else</strong>
                  <em>A different page, or SkyJet in general</em>
                </span>
              </label>
            </fieldset>

            <Field label="What's going on" htmlFor="feedback-topic" error={fields.topic}>
              <select
                id="feedback-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value as FeedbackTopicId)}
              >
                {FEEDBACK_TOPICS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Message"
              htmlFor="feedback-message"
              error={fields.message}
              required
              hint={
                scope === 'this_page'
                  ? `Tell us what you expected on ${pageTitle}.`
                  : 'Name the page or feature if it is not this one.'
              }
            >
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={6}
                maxLength={8000}
                required
                placeholder={
                  scope === 'this_page'
                    ? `What isn't working on ${pageTitle}?`
                    : 'What should we know?'
                }
              />
            </Field>

            <div className="feedback-dialog__actions">
              <button type="button" className="button button--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={pending}>
                {pending ? <DotsLoader label="Sending" tone="inverse" /> : 'Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );

  return createPortal(dialog, document.body);
}
