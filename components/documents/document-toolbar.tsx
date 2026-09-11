'use client';

import type { ReactNode } from 'react';
import { CompanyLogo } from '@/components/brand/company-logo';

export type DocumentMode = 'edit' | 'email' | 'pdf';

export function DocumentToolbar({
  mode,
  onModeChange,
  onCustomize,
  title,
}: {
  mode: DocumentMode;
  onModeChange: (mode: DocumentMode) => void;
  onCustomize: () => void;
  title?: string;
}) {
  return (
    <div className="doc-toolbar">
      <div className="doc-toolbar__modes" role="tablist" aria-label="Document mode">
        {(
          [
            ['edit', 'Edit'],
            ['email', 'Email view'],
            ['pdf', 'PDF view'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            className={`doc-toolbar__tab${mode === id ? ' is-active' : ''}`}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="doc-toolbar__right">
        {title ? <span className="cell-muted">{title}</span> : null}
        <button
          type="button"
          className="button button--ghost button--small doc-toolbar__gear"
          onClick={onCustomize}
          aria-label="Customise fields"
          title="Customise"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

export function DocumentEmailPanel({
  to,
  onToChange,
  subject,
  onSubjectChange,
  body,
  companyName,
  logoSrc,
}: {
  to: string;
  onToChange: (value: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  body: string;
  companyName?: string;
  logoSrc?: string;
}) {
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="doc-email stack">
      {logoSrc && companyName ? (
        <div className="doc-email__brand">
          <CompanyLogo src={logoSrc} alt={companyName} className="doc-sheet__logo-img" />
          <div>
            <div className="doc-sheet__company">{companyName}</div>
            <p className="cell-muted">Review and send uses your company logo on the invoice.</p>
          </div>
        </div>
      ) : null}
      <label className="field">
        <span className="field__label">To</span>
        <input value={to} onChange={(e) => onToChange(e.target.value)} type="email" />
      </label>
      <label className="field">
        <span className="field__label">Subject</span>
        <input value={subject} onChange={(e) => onSubjectChange(e.target.value)} />
      </label>
      <div className="doc-email__preview cell-muted">{body}</div>
      <div className="button-row">
        <a className="button button--primary" href={mailto}>
          Open email client
        </a>
      </div>
    </div>
  );
}

export function DocumentPdfFrame({ children }: { children: ReactNode }) {
  return (
    <div className="doc-pdf">
      <div className="button-row doc-pdf__actions">
        <button type="button" className="button" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>
      <div className="doc-pdf__sheet">{children}</div>
    </div>
  );
}
