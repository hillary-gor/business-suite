import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Subscriptions and billing · SkyJet' };

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Subscriptions and billing"
        description="Plan and invoice management is not connected yet."
      />
      <Card>
        <p className="cell-muted">
          This company is running on the current Skyjet Business Suite deployment. Metered
          billing and plan changes will land here when they exist.
        </p>
      </Card>
    </>
  );
}
