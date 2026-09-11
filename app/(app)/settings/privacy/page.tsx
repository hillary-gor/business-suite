import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Privacy · SkyJet' };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        title="Privacy"
        description="How this product holds company data."
      />
      <Card>
        <div className="stack">
          <p>
            Each legal entity’s books, customers and stock sit in that entity’s rows. Row-level
            security and permission checks decide who can read them. Sign-in is hosted Supabase
            Auth; application roles are stored separately and are what posting actually tests.
          </p>
          <p>
            The audit log records who changed audited tables. Ledger rows are append-only: a
            correction is a reversing entry, not an edit.
          </p>
        </div>
      </Card>
    </>
  );
}
