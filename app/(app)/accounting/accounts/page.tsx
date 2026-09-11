import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { listAccounts } from '@/server/modules/accounting/queries';
import { Badge, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';

export const metadata = { title: 'Chart of accounts · SkyJet' };

/**
 * The chart of accounts.
 *
 * Presented as the tree it actually is, with summary accounts as headings.
 * The distinction matters operationally: a summary account cannot be posted
 * to, and showing that plainly here prevents the support question about why a
 * journal was refused.
 */
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const { inactive } = await searchParams;
  const includeInactive = inactive === '1';

  const { context, entity } = await authorise(Permission.ReportsView);
  const accounts = await listAccounts(context, { includeInactive });

  const postable = accounts.filter((a) => !a.isSummary).length;

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description={`${accounts.length} accounts, ${postable} of which can be posted to. Summary accounts group their children and are never posted to directly.`}
        actions={
          <Link
            href={includeInactive ? '/accounting/accounts' : '/accounting/accounts?inactive=1'}
            className="button"
          >
            {includeInactive ? 'Hide inactive' : 'Show inactive'}
          </Link>
        }
      />

      <Card>
        {accounts.length === 0 ? (
          <EmptyState
            title="No accounts"
            description="The chart of accounts has not been seeded for this entity."
          />
        ) : (
          <DataTable dense>
            <thead>
              <tr>
                <th style={{ width: 90 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 110 }}>Type</th>
                <th style={{ width: 70 }}>Normal</th>
                <th style={{ width: 90 }}>Currency</th>
                <th>Attributes</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className={account.isSummary ? 'row--summary' : undefined}>
                  <td className="cell-code">{account.code}</td>
                  <td style={{ paddingLeft: 12 + account.depth * 16 }}>
                    {account.name}
                    {!account.isActive ? <span className="cell-muted"> · inactive</span> : null}
                  </td>
                  <td className="cell-muted">{account.accountType.toLowerCase()}</td>
                  <td className="cell-muted">{account.normalBalance === 'DEBIT' ? 'Dr' : 'Cr'}</td>
                  <td className="cell-code">
                    {account.currencyCode ?? <span className="cell-muted">any</span>}
                  </td>
                  <td>
                    <div className="inline">
                      {account.isSummary ? <Badge tone="neutral">summary</Badge> : null}
                      {account.isContra ? <Badge tone="info">contra</Badge> : null}
                      {account.controlType !== 'NONE' ? (
                        <Badge tone="info">{account.controlType.replace(/_/g, ' ')}</Badge>
                      ) : null}
                      {account.requiresCustomer ? <Badge tone="warning">customer</Badge> : null}
                      {account.requiresSupplier ? <Badge tone="warning">supplier</Badge> : null}
                      {account.requiresWarehouse ? <Badge tone="warning">warehouse</Badge> : null}
                    </div>
                  </td>
                  <td>
                    {account.isSummary ? null : (
                      <Link
                        href={`/accounting/ledger/${account.id}`}
                        className="button button--small button--ghost"
                      >
                        Ledger
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>

      <p className="text-muted text-small">
        A dimension marked <strong>customer</strong>, <strong>supplier</strong> or{' '}
        <strong>warehouse</strong> is required on every line posted to that account. That is what
        keeps the {entity.baseCurrency} control accounts reconcilable to their sub-ledgers.
      </p>
    </>
  );
}
