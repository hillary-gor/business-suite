import { redirect } from 'next/navigation';
import { Permission, type PermissionCode } from '@/server/auth/permissions';
import { can, canAccessModule, getSession, resolveEntity } from '@/server/auth/session';
import { PlatformModule } from '@/lib/platform/modules';
import { Alert } from '@/components/ui';
import { EntityPicker } from './entity-picker';
import { SignOutButton } from './sign-out-button';
import { AppSidebar } from './app-sidebar';
import { SuiteNavProvider, SuiteNavToggle } from './suite-nav';
import { SettingsMenu } from './settings-menu';
import { buildNavGroups } from './nav-model';
import { getEntityProfile } from '@/server/modules/settings/company';
import { entityLogoSrc } from '@/lib/brand';
import { ComposerFrame } from './composer-frame';
import { FeedbackHost } from '@/components/feedback/feedback-host';
import { ModuleLocked } from '@/components/platform/module-locked';
import { WorkspaceSwitch } from '@/components/platform/workspace-switch';
import { ColorModeToggle } from '@/components/platform/color-mode-toggle';

/**
 * The application shell.
 *
 * Navigation is filtered by permission, so a user sees the parts of the system
 * they can actually use. That is a courtesy rather than a control: the guard
 * that matters runs in the server action, and hiding a link protects nothing
 * on its own.
 *
 * The Create menu lists the QuickBooks-shaped transaction set, but only items
 * with a live posting path are clickable. Grey items are forthcoming, not
 * broken links.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/sign-in?next=/workspace');

  if (session.entities.length === 0) {
    return (
      <main className="shell__content">
        <Alert tone="warning" title="No entity access">
          Your account exists but has not been granted a role in any entity. Someone who can manage
          users needs to assign you one before you can use the system.
        </Alert>
        <SignOutButton />
      </main>
    );
  }

  const entity = await resolveEntity(session);
  if (!canAccessModule(session, entity.entityId, PlatformModule.BusinessSuite)) {
    return <ModuleLocked module={PlatformModule.BusinessSuite} entityName={entity.name} />;
  }

  const allow = (permission: PermissionCode) => can(session, entity.entityId, permission);
  const profile = await getEntityProfile({
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  });
  const logoSrc = entityLogoSrc(profile.has_logo, profile.updated_at);
  const initials = session.fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const groups = buildNavGroups(allow);
  const createColumns = [
    {
      title: 'Customers',
      items: [
        {
          label: 'Invoice',
          href: '/sales/invoices/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Receive payment',
          href: '/sales/payments/new',
          permission: allow(Permission.SalesPaymentCreate),
        },
        {
          label: 'Statement',
          href: '/sales/statements',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Estimate',
          href: '/sales/estimates/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Sales order',
          href: '/sales/orders/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Credit note',
          href: '/sales/credit-notes/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Debit note',
          href: '/sales/debit-notes/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Sales receipt',
          href: '/sales/receipts/new',
          permission: allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Refund receipt',
          href: '/sales/refunds/new',
          permission: allow(Permission.SalesPaymentCreate),
        },
        {
          label: 'Add customer',
          href: '/sales/customers/new',
          permission: allow(Permission.MastersManageCustomers),
        },
      ],
    },
    {
      title: 'Suppliers',
      items: [
        {
          label: 'Expense',
          href: '/purchasing/expenses/new',
          permission: allow(Permission.FinancePaymentCreate),
        },
        {
          label: 'Bill',
          href: '/purchasing/bills/new',
          permission: allow(Permission.FinancePaymentCreate),
        },
        {
          label: 'Pay bills',
          href: '/purchasing/payments/new',
          permission: allow(Permission.FinancePaymentCreate),
        },
        {
          label: 'Statement',
          href: '/purchasing/statements',
          permission: allow(Permission.FinancePaymentCreate),
        },
        {
          label: 'Purchase order',
          href: '/purchasing/orders/new',
          permission: allow(Permission.ProcurementPurchaseCreate),
        },
        {
          label: 'Item receipt',
          href: '/purchasing/receipts/new',
          permission: allow(Permission.ProcurementPurchaseReceive),
        },
        {
          label: 'Supplier credit',
          href: '/purchasing/credits/new',
          permission: allow(Permission.FinancePaymentCreate),
        },
        {
          label: 'Add supplier',
          href: '/purchasing/vendors/new',
          permission: allow(Permission.MastersManageSuppliers),
        },
      ],
    },
    {
      title: 'Other',
      items: [
        {
          label: 'Journal entry',
          href: '/accounting/journals/new',
          permission: allow(Permission.GlPostJournal),
        },
        { label: 'Bank deposit', disabled: true },
        {
          label: 'Transfer',
          href: '/inventory/transfers/new',
          permission: allow(Permission.InvManageStock),
        },
        {
          label: 'Inventory adjustment',
          href: '/inventory/adjustments/new',
          permission: allow(Permission.InvAdjustStock),
        },
        {
          label: 'Add product/service',
          href: '/inventory/items/new',
          permission: allow(Permission.MastersManageItems),
        },
        {
          label: 'Add category',
          href: '/inventory/categories?new=1',
          permission: allow(Permission.MastersManageItems),
        },
        {
          label: 'Add an employee',
          href: '/team/employees/new',
          permission: allow(Permission.TeamEmployeeManage),
        },
      ],
    },
  ];
  const settingsColumns = [
    {
      title: 'Your company',
      items: [
        {
          label: 'Account and settings',
          href: '/settings/company',
          permission: allow(Permission.SettingsManage),
        },
        {
          label: 'Post-invoice survey',
          href: '/settings/sales',
          permission: allow(Permission.SettingsManage),
        },
        {
          label: 'Manage users',
          href: '/settings/users',
          permission: allow(Permission.UsersManage),
        },
        {
          label: 'Custom form styles',
          href: '/settings/form-styles',
          permission: allow(Permission.SettingsManage) || allow(Permission.SalesInvoiceCreate),
        },
        {
          label: 'Default report settings',
          href: '/settings/reports',
          permission: allow(Permission.ReportsView),
        },
        {
          label: 'Chart of accounts',
          href: '/accounting/accounts',
          permission: allow(Permission.ReportsView),
        },
        {
          label: 'Additional info',
          href: '/settings/additional',
          permission: allow(Permission.SettingsManage),
        },
      ],
    },
    {
      title: 'Lists',
      items: [
        {
          label: 'All lists',
          href: '/settings/lists',
          permission: allow(Permission.MastersRead),
        },
        {
          label: 'Products and services',
          href: '/inventory/products',
          permission: allow(Permission.MastersManageItems),
        },
        { label: 'Recurring transactions', disabled: true },
        { label: 'Attachments', disabled: true },
        { label: 'Custom fields', disabled: true },
        { label: 'Rules', disabled: true },
      ],
    },
    {
      title: 'Tools',
      items: [
        { label: 'Manage workflows', disabled: true },
        { label: 'Reclassify transactions', disabled: true },
        {
          label: 'Import data',
          href: '/accounting/opening-balances',
          permission: allow(Permission.GlImportOpeningBalances),
        },
        { label: 'Export data', disabled: true },
        { label: 'Reconcile', disabled: true },
        { label: 'Budgeting', disabled: true },
        {
          label: 'Audit log',
          href: '/settings/audit',
          permission: allow(Permission.AuditRead),
        },
        { label: 'Back up company', disabled: true },
        { label: 'Share screen', disabled: true },
      ],
    },
    {
      title: 'Profile',
      items: [
        { label: 'Subscriptions and billing', href: '/settings/billing' },
        { label: 'Feedback', action: 'feedback' as const },
        { label: 'Privacy', href: '/settings/privacy' },
      ],
    },
  ];

  return (
    <FeedbackHost>
      <SuiteNavProvider>
        <div className="shell">
          <AppSidebar
            entityName={entity.name}
            logoSrc={logoSrc}
            groups={groups}
            createColumns={createColumns}
          />

          <div className="shell__main">
            <header className="shell__topbar">
              <div className="shell__topbar-left">
                <SuiteNavToggle />
                {session.entities.length > 1 ? (
                  <EntityPicker
                    className="shell__entity"
                    entities={session.entities.map((e) => ({
                      entityId: e.entityId,
                      code: e.code,
                      name: e.name,
                    }))}
                    current={entity.entityId}
                  />
                ) : null}
              </div>

              <div className="shell__user">
                <ColorModeToggle />
                <WorkspaceSwitch className="button button--ghost button--small shell__workspace">
                  <span className="shell__label-full">Switch workspace</span>
                  <span className="shell__label-short">Workspace</span>
                </WorkspaceSwitch>
                <SettingsMenu columns={settingsColumns} />
                <span className="user-chip">
                  <span className="user-chip__avatar" aria-hidden="true">
                    {initials || '•'}
                  </span>
                  <span className="user-chip__name">
                    {session.fullName}
                    {entity.roles.length > 0 ? (
                      <span className="user-chip__role">{entity.roles[0]}</span>
                    ) : null}
                  </span>
                </span>
                <SignOutButton className="button--ghost button--small shell__sign-out" />
              </div>
            </header>

            <main className="shell__content">
              <ComposerFrame>{children}</ComposerFrame>
            </main>
          </div>
        </div>
      </SuiteNavProvider>
    </FeedbackHost>
  );
}
