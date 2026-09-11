'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { saveSalesSurveySettingsAction } from '@/server/actions/settings';
import { Alert } from '@/components/ui';
import {
  SURVEY_FREQUENCY_DAYS,
  surveyFrequencyLabel,
  surveyOnOff,
  type SalesSurveySettings,
  type SurveyFrequencyDays,
} from '@/lib/customer-hub';

type PreviewId = 'work' | 'review' | 'referral' | null;

export function SalesSettingsEditor({
  initial,
  companyName,
  openSurvey = false,
}: {
  initial: SalesSurveySettings;
  companyName: string;
  openSurvey?: boolean;
}) {
  const [persisted, setPersisted] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(openSurvey);
  const [preview, setPreview] = useState<PreviewId>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setDraft(persisted);
    setEditing(false);
    setPreview(null);
    setError(null);
    setSaved(false);
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveSalesSurveySettingsAction(draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPersisted(draft);
      setEditing(false);
      setPreview(null);
      setSaved(true);
    });
  }

  return (
    <section className={`acct-block${editing ? ' is-editing' : ''}`}>
      {editing ? (
        <div className="acct-survey">
          <p className="acct-survey__lede">Collect valuable feedback from your customers</p>
          {error ? <Alert>{error}</Alert> : null}
          <SurveyToggle
            title="Ask for a work request"
            description="Ask your customers to indicate whether they would like to work with you again within a specific timeframe."
            on={draft.askWorkRequest}
            onToggle={(value) => setDraft({ ...draft, askWorkRequest: value })}
            onPreview={() => setPreview(preview === 'work' ? null : 'work')}
            previewOpen={preview === 'work'}
            preview={
              <p>
                Would you like to work with {companyName} again? Customers can say yes and pick a
                timeframe.
              </p>
            }
          />
          <SurveyToggle
            title="Ask for a review, feedback or testimonials"
            description="Ask your customers to rate your service on a scale of 1 to 5, and optionally leave feedback or a testimonial."
            on={draft.askReview}
            onToggle={(value) => setDraft({ ...draft, askReview: value })}
            onPreview={() => setPreview(preview === 'review' ? null : 'review')}
            previewOpen={preview === 'review'}
            preview={
              <div className="acct-survey__preview-stars">
                <p>Overall, how satisfied were you with {companyName}?</p>
                <p aria-hidden="true">★★★★★</p>
                <p>Customers can also leave a comment or testimonial.</p>
              </div>
            }
          />
          <SurveyToggle
            title="Ask for a referral"
            description="Ask your customers to recommend anyone who might be interested in working with you. (If you enable reviews, only customers who give you 4 or 5 stars will be asked to provide a referral)."
            on={draft.askReferral}
            onToggle={(value) => setDraft({ ...draft, askReferral: value })}
            onPreview={() => setPreview(preview === 'referral' ? null : 'referral')}
            previewOpen={preview === 'referral'}
            preview={
              <p>
                Is there anyone you would recommend to {companyName}? If reviews are on, this is
                only asked after a 4 or 5 star rating.
              </p>
            }
          />
          <div className="acct-survey__frequency">
            <label htmlFor="survey-frequency">Manage survey frequency</label>
            <select
              id="survey-frequency"
              value={draft.frequencyDays}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  frequencyDays: Number(event.target.value) as SurveyFrequencyDays,
                })
              }
            >
              {SURVEY_FREQUENCY_DAYS.map((days) => (
                <option key={days} value={days}>
                  {surveyFrequencyLabel(days)}
                </option>
              ))}
            </select>
            <p>
              Limit the frequency of this survey to once every {draft.frequencyDays} days after a
              customer has submitted a survey. Changes to the survey questions will not affect the{' '}
              {draft.frequencyDays}-day interval.
            </p>
          </div>
          <div className="button-row">
            <button type="button" className="button" onClick={cancel} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={save}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : (
        <div className="acct-block__body">
          {saved ? <Alert tone="success">Survey settings saved.</Alert> : null}
          <ul className="acct-block__summary">
            <li>
              Ask for a work request <strong>{surveyOnOff(persisted.askWorkRequest)}</strong>
            </li>
            <li>
              Ask for a review, feedback or testimonials{' '}
              <strong>{surveyOnOff(persisted.askReview)}</strong>
            </li>
            <li>
              Ask for a referral <strong>{surveyOnOff(persisted.askReferral)}</strong>
            </li>
            <li>
              Frequency <strong>{surveyFrequencyLabel(persisted.frequencyDays)}</strong>
            </li>
          </ul>
          <button
            type="button"
            className="acct-block__edit"
            aria-label="Edit Post-invoice/Feedback survey"
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            <PencilIcon />
          </button>
        </div>
      )}
    </section>
  );
}

function SurveyToggle({
  title,
  description,
  on,
  onToggle,
  onPreview,
  previewOpen,
  preview,
}: {
  title: string;
  description: string;
  on: boolean;
  onToggle: (value: boolean) => void;
  onPreview: () => void;
  previewOpen: boolean;
  preview: ReactNode;
}) {
  return (
    <div className="acct-survey__row">
      <div>
        <p className="acct-survey__title">{title}</p>
        <p className="acct-survey__copy">{description}</p>
        <button type="button" className="button button--ghost" onClick={onPreview}>
          {previewOpen ? 'Hide survey question' : 'Preview survey question'}
        </button>
        {previewOpen ? <div className="acct-survey__preview">{preview}</div> : null}
      </div>
      <button
        type="button"
        className={`prefs-switch${on ? ' is-on' : ''}`}
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={() => onToggle(!on)}
      >
        <span className="prefs-switch__thumb" />
      </button>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.4 2.4 13.6 4.6 5.9 12.3 3.5 12.5 3.7 10.1 11.4 2.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10.2 3.6 12.4 5.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
