import { redirect } from 'next/navigation';
import { parseNewProductType } from '@/lib/inventory-list';

export const metadata = { title: 'Add product · SkyJet' };

/** The add flow lives in a panel on the inventory list. Old links still work. */
export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const parsed = parseNewProductType(type) ?? 'INVENTORY';
  redirect(`/inventory/products?new=${parsed}`);
}
