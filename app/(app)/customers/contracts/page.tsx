import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { PageFeedback } from '@/components/lists/list-chrome';

export const metadata = { title: 'Contracts · SkyJet' };

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const templates = params.tab === 'templates';

  return (
    <>
      <PageHeader
        title={
          <span className="hub-contracts__title">
            Contracts
            <span className="badge badge--info">Beta</span>
          </span>
        }
        description="E-sign contracts are not in this version. An accepted estimate converted to an invoice is the current path."
        actions={
          <>
            <PageFeedback className="button button--ghost">Give feedback</PageFeedback>
            <button
              type="button"
              className="button button--primary"
              disabled
              title="E-sign contracts are not in this version"
            >
              Create contract
            </button>
          </>
        }
      />

      <div className="tabs" aria-label="Contract views">
        <Link href="/customers/contracts" aria-current={!templates ? 'page' : undefined}>
          All contracts
        </Link>
        <Link
          href="/customers/contracts?tab=templates"
          aria-current={templates ? 'page' : undefined}
        >
          Contract templates
        </Link>
      </div>

      <div className="hub-contracts">
        {templates ? (
          <div className="hub-contracts__empty">
            <ContractArt />
            <h2>No contract templates</h2>
            <p>Reusable e-sign templates are not in this version.</p>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <label>
                Status
                <select disabled defaultValue="all" aria-label="Status">
                  <option value="all">All statuses</option>
                </select>
              </label>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Contract name</th>
                    <th>Customer/Lead</th>
                    <th>Recipient email(s)</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div className="hub-contracts__empty">
              <ContractArt />
              <h2>You have no contracts</h2>
              <p>Create a new contract to e-sign with your own PDF document.</p>
              <p className="hub-contracts__note">
                Creating and sending contracts for signature is not in this version.
              </p>
              <button
                type="button"
                className="button"
                disabled
                title="E-sign contracts are not in this version"
              >
                Create a contract
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ContractArt() {
  return (
    <svg width="88" height="72" viewBox="0 0 88 72" fill="none" aria-hidden="true">
      <rect
        x="18"
        y="8"
        width="44"
        height="56"
        rx="4"
        fill="var(--surface)"
        stroke="var(--line-strong)"
      />
      <path d="M26 22h28M26 30h28M26 38h18" stroke="var(--line-strong)" strokeWidth="2" />
      <path
        d="M48 44c8 2 16 10 20 16"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="66" cy="56" r="10" fill="var(--brand-tint)" stroke="var(--brand)" />
      <path
        d="M61 56.5 64.2 59.5 71 52.8"
        stroke="var(--brand)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
