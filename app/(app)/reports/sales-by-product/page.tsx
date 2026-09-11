import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getSalesByProduct } from '@/server/modules/reports/queries';
import { displayCurrency } from '@/lib/inventory-overview';
import { formatReportTimestamp, resolveReportQuery } from '@/lib/report-periods';
import { SalesByProductReport } from './report';

export const metadata = { title: 'Sales by Product/Service Summary · SkyJet' };

export default async function SalesByProductPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string; basis?: string }>;
}) {
  const params = await searchParams;
  const { context, entity } = await authorise(Permission.ReportsView);
  const query = resolveReportQuery(params);
  const rows = await getSalesByProduct(context, query.from, query.to, query.basis);

  return (
    <SalesByProductReport
      companyName={entity.name}
      currency={displayCurrency(entity.baseCurrency)}
      query={query}
      generatedAt={formatReportTimestamp()}
      rows={rows.map((row) => ({
        itemId: row.item_id,
        categoryId: row.category_id,
        categoryName: row.category_name,
        productName: row.product_name,
        quantity: row.quantity,
        amount: row.amount,
        cos: row.cos,
      }))}
    />
  );
}
