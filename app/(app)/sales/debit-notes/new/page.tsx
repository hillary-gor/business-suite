import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getEntityDocumentContext, listCustomersForSelect, listTaxCodes } from '@/server/modules/sales/documents';
import { Card, PageHeader } from '@/components/ui';
import { entityLogoSrc } from '@/lib/brand';
import { DebitNoteForm } from './debit-note-form';

export const metadata = { title: 'Debit note · SkyJet' };

export default async function NewDebitNotePage() {
  const { context, entity } = await authorise(Permission.SalesInvoiceCreate);
  const [customers, taxCodes, entityCtx] = await Promise.all([
    listCustomersForSelect(context),
    listTaxCodes(context),
    getEntityDocumentContext(context),
  ]);
  const defaultTax =
    taxCodes.find((t) => t.code === 'VAT16')?.id ?? taxCodes[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="Debit note"
        description="Increases customer AR and revenue. Use sparingly for under-billed invoices."
      />
      <Card>
        <DebitNoteForm
          customers={customers.map((c) => ({
            id: c.id,
            label: `${c.code} — ${c.legal_name}`,
            currencyCode: c.currency_code,
          }))}
          taxCodes={taxCodes.map((t) => ({
            id: t.id,
            label: `${t.code} (${Number(t.rate) * 100}%)`,
            rate: t.rate,
          }))}
          defaultTaxCodeId={defaultTax}
          baseCurrency={entity.baseCurrency}
          entity={{
            name: entityCtx.name,
            tradingName: entityCtx.trading_name,
            registrationNumber: entityCtx.registration_number,
            logoSrc: entityLogoSrc(entityCtx.has_logo, entityCtx.updated_at),
          }}
        />
      </Card>
    </>
  );
}
