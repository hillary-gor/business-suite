import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { PermissionDeniedError } from '@/server/db/errors';
import { Card, PageHeader } from '@/components/ui';

export const metadata = { title: 'Expenses & Bills · SkyJet' };

export default async function PurchasingHomePage() {
  const session = await requireSession();
  const entity = await resolveEntity(session);

  const mayVendors = can(session, entity.entityId, Permission.MastersManageSuppliers);
  const mayPo = can(session, entity.entityId, Permission.ProcurementPurchaseCreate);
  const mayReceive = can(session, entity.entityId, Permission.ProcurementPurchaseReceive);
  const mayPay = can(session, entity.entityId, Permission.FinancePaymentCreate);

  if (!mayVendors && !mayPo && !mayReceive && !mayPay) {
    throw new PermissionDeniedError('You do not have permission to view expenses and bills');
  }

  return (
    <>
      <PageHeader
        title="Expenses & Bills"
        description="Suppliers, purchase orders, item receipts, expenses, bills and payments share one payables path."
      />
      <div className="card-grid">
        {mayPay || mayPo || mayReceive ? (
          <Card>
            <h2 className="card-title">Expense transactions</h2>
            <p className="cell-muted">
              All payables activity in one register, with a cash expense when you pay immediately.
            </p>
            <div className="button-row">
              <Link href="/purchasing/expenses" className="button">
                View transactions
              </Link>
              {mayPay ? (
                <Link href="/purchasing/expenses/new" className="button button--primary">
                  New expense
                </Link>
              ) : null}
            </div>
          </Card>
        ) : null}

        {mayPo ? (
          <Card>
            <h2 className="card-title">Purchase orders</h2>
            <p className="cell-muted">Commitments. Approval does not post the ledger.</p>
            <div className="button-row">
              <Link href="/purchasing/orders" className="button">
                View orders
              </Link>
              <Link href="/purchasing/orders/new" className="button button--primary">
                New PO
              </Link>
            </div>
          </Card>
        ) : null}

        {mayReceive ? (
          <Card>
            <h2 className="card-title">Item receipts</h2>
            <p className="cell-muted">Receive stock against GRNI.</p>
            <div className="button-row">
              <Link href="/purchasing/receipts" className="button">
                View receipts
              </Link>
              <Link href="/purchasing/receipts/new" className="button button--primary">
                New receipt
              </Link>
            </div>
          </Card>
        ) : null}

        {mayVendors ? (
          <Card>
            <h2 className="card-title">Suppliers</h2>
            <p className="cell-muted">Vendors you buy from, with open balances.</p>
            <div className="button-row">
              <Link href="/purchasing/vendors" className="button">
                View suppliers
              </Link>
              <Link href="/purchasing/vendors/new" className="button button--primary">
                New supplier
              </Link>
            </div>
          </Card>
        ) : null}

        {mayPay ? (
          <Card>
            <h2 className="card-title">Bills &amp; payments</h2>
            <p className="cell-muted">AP bills, pay bills, and supplier credits.</p>
            <div className="button-row">
              <Link href="/purchasing/bills" className="button">
                View bills
              </Link>
              <Link href="/purchasing/bills/new" className="button button--primary">
                New bill
              </Link>
              <Link href="/purchasing/payments/new" className="button">
                Pay bills
              </Link>
              <Link href="/purchasing/credits/new" className="button">
                Supplier credit
              </Link>
              <Link href="/purchasing/statements" className="button">
                Statements
              </Link>
            </div>
          </Card>
        ) : null}
      </div>
    </>
  );
}
