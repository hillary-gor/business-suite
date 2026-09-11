import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise, can } from '@/server/auth/session';
import { listCurrencies, listPaymentTerms } from '@/server/modules/inventory/masters';
import { getSupplier } from '@/server/modules/purchasing/lists';
import { parseSupplierId } from '@/lib/supplier-hub';
import { Card, PageHeader } from '@/components/ui';
import { VendorForm } from '../../new/vendor-form';

export const metadata = { title: 'Edit supplier · SkyJet' };

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId: rawId } = await params;
  const supplierId = parseSupplierId(rawId);
  if (!supplierId) notFound();

  const { context, session, entity } = await authorise(Permission.MastersManageSuppliers);
  const [supplier, paymentTerms, currencies] = await Promise.all([
    getSupplier(context, supplierId),
    listPaymentTerms(context),
    listCurrencies(context),
  ]);
  if (!supplier) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${supplier.legal_name}`}
        description="Updates the supplier record used on purchase orders, bills and payments."
      />
      <Card>
        <VendorForm
          currencies={currencies}
          paymentTerms={paymentTerms.map((t) => ({
            id: t.id,
            label: `${t.code} — ${t.name}`,
          }))}
          baseCurrency={entity.baseCurrency}
          canApprove={can(session, entity.entityId, Permission.MastersApproveSupplier)}
          submitLabel="Save supplier"
          supplier={{
            id: supplier.id,
            legalName: supplier.legal_name,
            tradingName: supplier.trading_name ?? '',
            code: supplier.code,
            email: supplier.email ?? '',
            phone: supplier.phone ?? '',
            taxPin: supplier.tax_pin ?? '',
            currencyCode: supplier.currency_code,
            paymentTermsId: supplier.payment_terms_id ?? '',
            notes: supplier.notes ?? '',
            approvalStatus: supplier.approval_status as
              'PENDING' | 'APPROVED' | 'SUSPENDED' | 'BLACKLISTED',
          }}
        />
      </Card>
    </>
  );
}
