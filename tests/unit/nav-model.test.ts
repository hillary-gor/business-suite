import { describe, expect, it } from 'vitest';
import {
  buildNavGroups,
  pathIsActive,
  railFromPath,
  type AppNavGroup,
} from '@/app/(app)/nav-model';

const groups: AppNavGroup[] = [
  {
    id: 'customers',
    label: 'Customer Hub',
    items: [
      { href: '/customers', label: 'Overview' },
      { href: '/sales/customers', label: 'Customers & leads' },
      { href: '/sales/estimates', label: 'Estimates' },
      { href: '/customers/reviews', label: 'Reviews' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { href: '/sales', label: 'Overview' },
      { href: '/sales/transactions', label: 'Sales transactions' },
      { href: '/sales/invoices', label: 'Invoices' },
    ],
  },
  {
    id: 'purchasing',
    label: 'Expenses & Bills',
    items: [
      { href: '/purchasing', label: 'Overview' },
      { href: '/purchasing/vendors', label: 'Suppliers' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    items: [
      { href: '/reports', label: 'Standard reports' },
      { href: '/reports/custom', label: 'Custom reports' },
      { href: '/reports/management', label: 'Management reports' },
    ],
  },
];

describe('pathIsActive', () => {
  it('matches a document and its child routes, not sibling modules', () => {
    expect(pathIsActive('/sales/invoices', '/sales/invoices')).toBe(true);
    expect(pathIsActive('/sales/invoices/new', '/sales/invoices')).toBe(true);
    expect(pathIsActive('/sales/invoices', '/sales/customers')).toBe(false);
    expect(pathIsActive('/sales/customers/new', '/sales/customers')).toBe(true);
    expect(pathIsActive('/sales/estimates/new', '/sales/estimates')).toBe(true);
  });

  it('does not treat a section overview as current on a child page', () => {
    expect(pathIsActive('/purchasing', '/purchasing')).toBe(true);
    expect(pathIsActive('/purchasing/vendors', '/purchasing')).toBe(false);
    expect(pathIsActive('/reports/profit-and-loss', '/reports')).toBe(true);
    expect(pathIsActive('/reports/custom', '/reports')).toBe(false);
    expect(pathIsActive('/reports/management', '/reports')).toBe(false);
    expect(pathIsActive('/reports/performance', '/reports')).toBe(false);
    expect(pathIsActive('/reports/cash-flow', '/reports')).toBe(false);
    expect(pathIsActive('/reports/performance', '/reports/performance')).toBe(true);
    expect(pathIsActive('/reports/cash-flow', '/reports/cash-flow')).toBe(true);
    expect(pathIsActive('/customers', '/customers')).toBe(true);
    expect(pathIsActive('/customers/opportunities', '/customers')).toBe(false);
    expect(pathIsActive('/sales', '/sales')).toBe(true);
    expect(pathIsActive('/sales/invoices', '/sales')).toBe(false);
    expect(pathIsActive('/sales/transactions', '/sales')).toBe(false);
    expect(pathIsActive('/sales/transactions', '/sales/transactions')).toBe(true);
  });

  it('keeps product new and edit under the inventory listing', () => {
    expect(pathIsActive('/inventory/products', '/inventory/products')).toBe(true);
    expect(pathIsActive('/inventory/items/new', '/inventory/products')).toBe(true);
    expect(pathIsActive('/inventory/items/abc/edit', '/inventory/products')).toBe(true);
    expect(pathIsActive('/inventory/items/new', '/inventory/adjustments')).toBe(false);
    expect(pathIsActive('/inventory/products', '/inventory')).toBe(false);
  });
});

describe('railFromPath', () => {
  it('maps home, module, and report routes onto the rail', () => {
    expect(railFromPath('/', groups)).toBe('home');
    expect(railFromPath('/business-suite', groups)).toBe('home');
    expect(railFromPath('/sales', groups)).toBe('sales');
    expect(railFromPath('/sales/transactions', groups)).toBe('sales');
    expect(railFromPath('/sales/invoices/new', groups)).toBe('sales');
    expect(railFromPath('/sales/customers', groups)).toBe('customers');
    expect(railFromPath('/sales/estimates/new', groups)).toBe('customers');
    expect(railFromPath('/customers', groups)).toBe('customers');
    expect(railFromPath('/customers/opportunities', groups)).toBe('customers');
    expect(railFromPath('/customers/reviews', groups)).toBe('customers');
    expect(railFromPath('/purchasing/vendors', groups)).toBe('purchasing');
    expect(railFromPath('/reports/profit-and-loss', groups)).toBe('reports');
    expect(railFromPath('/reports/custom', groups)).toBe('reports');
    expect(railFromPath('/settings/company', groups)).toBe('apps');
  });
});

describe('buildNavGroups', () => {
  it('puts Overview first in the Sales group, then Sales transactions', () => {
    const sales = buildNavGroups(() => true).find((group) => group.id === 'sales');
    expect(sales?.items[0]).toEqual({ href: '/sales', label: 'Overview' });
    expect(sales?.items[1]).toEqual({
      href: '/sales/transactions',
      label: 'Sales transactions',
    });
    expect(sales?.items.find((item) => item.label === 'Invoices')).toEqual({
      href: '/sales/invoices',
      label: 'Invoices',
    });
    expect(sales?.items.some((item) => 'href' in item && item.href === '/sales/invoices/new')).toBe(
      false,
    );
  });

  it('keeps payables under Expenses & Bills and stock intake under Inventory', () => {
    const all = buildNavGroups(() => true);
    const purchasing = all.find((group) => group.id === 'purchasing');
    const inventory = all.find((group) => group.id === 'inventory');

    expect(purchasing?.items.map((item) => item.label)).toEqual([
      'Expense transactions',
      'Suppliers',
      'Bills',
      'Statements',
    ]);
    expect(inventory?.items.slice(0, 3)).toEqual([
      { href: '/inventory', label: 'Overview' },
      { href: '/purchasing/orders', label: 'Purchase orders' },
      { href: '/purchasing/receipts', label: 'Item receipts' },
    ]);
    expect(railFromPath('/purchasing/orders', all)).toBe('inventory');
    expect(railFromPath('/purchasing/receipts/new', all)).toBe('inventory');
    expect(railFromPath('/purchasing/vendors', all)).toBe('purchasing');
  });

  it('lists Standard reports first, then Financial Planning, on Reports & Analytics', () => {
    const reports = buildNavGroups(() => true).find((group) => group.id === 'reports');
    expect(reports?.label).toBe('Reports & Analytics');
    expect(reports?.items.map((item) => item.label)).toEqual([
      'Standard reports',
      'Financial Planning',
      'Performance centre',
      'Custom reports',
      'Management reports',
    ]);
    const planning = reports?.items.find((item) => item.label === 'Financial Planning');
    expect(planning).toEqual({
      label: 'Financial Planning',
      children: [{ href: '/reports/cash-flow', label: 'Cash flow overview' }],
    });
  });
});
