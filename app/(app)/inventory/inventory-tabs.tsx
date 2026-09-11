import Link from 'next/link';

/**
 * Products and adjustments are two views of the same thing — what we hold and
 * why the number changed — so they share a page heading and sit under tabs
 * rather than in separate corners of the menu.
 */
export function InventoryTabs({ active }: { active: 'products' | 'adjustments' }) {
  return (
    <nav className="tabs tabs--pill" aria-label="Inventory views">
      <Link href="/inventory/products" aria-current={active === 'products' ? 'page' : undefined}>
        Products
      </Link>
      <Link
        href="/inventory/adjustments"
        aria-current={active === 'adjustments' ? 'page' : undefined}
      >
        Adjustments
      </Link>
    </nav>
  );
}
