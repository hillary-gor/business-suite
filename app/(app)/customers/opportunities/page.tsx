import Link from 'next/link';
import { SURVEY_SETTINGS_HREF } from '@/lib/customer-hub';

export const metadata = { title: 'Opportunities · SkyJet' };

export default function OpportunitiesPage() {
  return (
    <div className="hub-setup">
      <header className="hub-setup__head">
        <h1>Grow and manage your opportunities in Customer Hub</h1>
        <p>
          Connect to Gmail, Outlook, contact form, post-invoice survey and more to generate and
          manage a pipeline of opportunities. Email inbox, contact forms and a CRM pipeline are not
          in this version — the live path is an estimate, then an invoice.
        </p>
      </header>

      <div className="hub-setup__body">
        <div className="hub-setup__cards">
          <article className="hub-setup__card">
            <div className="hub-setup__icons" aria-hidden="true">
              <span className="hub-setup__mark hub-setup__mark--gmail">G</span>
              <span className="hub-setup__mark hub-setup__mark--outlook">O</span>
            </div>
            <h2>Gmail or Outlook</h2>
            <p>
              Connecting a mailbox so an agent can find opportunities is not in this version. Send
              an estimate when you already know the job.
            </p>
            <div className="hub-setup__actions">
              <button
                type="button"
                className="button"
                disabled
                title="Mailbox connections are not in this version"
              >
                Connect
              </button>
            </div>
          </article>

          <article className="hub-setup__card">
            <div className="hub-setup__icons" aria-hidden="true">
              <span className="hub-setup__mark hub-setup__mark--survey">S</span>
            </div>
            <h2>Referrals &amp; Work Requests</h2>
            <p>
              Strengthen customer relationships by turning on the post-invoice survey for work
              requests, referrals and reviews.
            </p>
            <div className="hub-setup__actions">
              <Link href={SURVEY_SETTINGS_HREF} className="button">
                Enable Survey
              </Link>
            </div>
          </article>

          <article className="hub-setup__card">
            <div className="hub-setup__icons" aria-hidden="true">
              <span className="hub-setup__doc" />
            </div>
            <h2>Manually added and imported</h2>
            <p>
              There is no opportunity record to add or import. Create a customer and send an
              estimate instead.
            </p>
            <div className="hub-setup__actions">
              <button
                type="button"
                className="button"
                disabled
                title="Opportunities are not a separate record in this version"
              >
                Add opportunity
              </button>
            </div>
          </article>

          <article className="hub-setup__card">
            <div className="hub-setup__icons" aria-hidden="true">
              <span className="hub-setup__globe" />
            </div>
            <h2>Contact forms</h2>
            <p>
              Embedded website contact forms are not in this version. New work starts from a
              customer and an estimate.
            </p>
            <div className="hub-setup__actions">
              <button
                type="button"
                className="button"
                disabled
                title="Contact forms are not in this version"
              >
                Create contact form
              </button>
            </div>
          </article>
        </div>

        <div className="hub-setup__art" aria-hidden="true">
          <OpportunitiesArt />
        </div>
      </div>
    </div>
  );
}

function OpportunitiesArt() {
  return (
    <svg viewBox="0 0 280 280" width="280" height="280" fill="none">
      <circle cx="140" cy="140" r="88" stroke="var(--line-strong)" strokeDasharray="6 8" />
      <circle cx="140" cy="52" r="16" fill="var(--brand-tint)" stroke="var(--brand)" />
      <circle cx="228" cy="140" r="16" fill="var(--surface)" stroke="var(--line-strong)" />
      <circle cx="52" cy="140" r="16" fill="var(--surface)" stroke="var(--line-strong)" />
      <rect x="108" y="118" width="64" height="104" rx="32" fill="var(--brand)" />
      <circle cx="140" cy="108" r="22" fill="var(--brand)" />
      <rect x="126" y="168" width="28" height="40" rx="6" fill="#fff" />
    </svg>
  );
}
