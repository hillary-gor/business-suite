import { redirect } from 'next/navigation';

export const metadata = { title: 'Products · SkyJet' };

/** The catalogue lives on the Inventory listing. This path stays so old links still work. */
export default function ItemsPage() {
  redirect('/inventory/products');
}
