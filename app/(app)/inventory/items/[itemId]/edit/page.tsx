import { notFound } from 'next/navigation';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import {
  getItem,
  listItemCategories,
  listManufacturers,
  listSuppliers,
  listUnitsOfMeasure,
} from '@/server/modules/inventory/masters';
import { Card, PageHeader } from '@/components/ui';
import { ItemForm, type ItemType } from '../../item-form';

export const metadata = { title: 'Edit product · SkyJet' };

export default async function EditItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { context } = await authorise(Permission.MastersManageItems);
  const { itemId } = await params;
  const [item, categories, manufacturers, units, suppliers] = await Promise.all([
    getItem(context, itemId),
    listItemCategories(context),
    listManufacturers(context),
    listUnitsOfMeasure(context),
    listSuppliers(context),
  ]);

  if (!item) notFound();

  const itemType: ItemType = item.is_stocked
    ? 'INVENTORY'
    : item.is_purchasable
      ? 'NON_INVENTORY'
      : 'SERVICE';

  return (
    <>
      <PageHeader
        title={item.description}
        description={`Part number ${item.part_number}`}
        actions={null}
      />
      <Card>
        <ItemForm
          categories={categories.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
          manufacturers={manufacturers.map((m) => ({ id: m.id, label: `${m.code} — ${m.name}` }))}
          units={units}
          suppliers={suppliers.map((s) => ({ id: s.id, label: s.legal_name }))}
          initial={{
            itemId: item.id,
            description: item.description,
            partNumber: item.part_number,
            itemType,
            categoryId: item.category_id ?? '',
            manufacturerId: item.manufacturer_id ?? '',
            uomCode: item.uom_code,
            trackingMode: item.tracking_mode as 'NONE' | 'LOT' | 'SERIAL',
            reorderPoint: item.reorder_point ?? '',
            reorderQuantity: item.reorder_quantity ?? '',
            salesDescription: item.sales_description ?? '',
            purchaseDescription: item.purchase_description ?? '',
            salesPrice: item.sales_price ?? '',
            purchaseCost: item.purchase_cost ?? '',
            preferredSupplierId: item.preferred_supplier_id ?? '',
            isActive: item.is_active,
          }}
        />
      </Card>
    </>
  );
}
