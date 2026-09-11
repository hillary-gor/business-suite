/**
 * Cash flow overview reads — cash on hand, monthly movements, open AR/AP.
 *
 * Amounts stay strings. Projection uses invoice and bill due dates, not a
 * bank feed.
 */
import { cashFlowWindow, monthEnd, type CashFlowPayload } from '@/lib/cash-flow';
import { Money } from '@/lib/money';
import { nairobiToday } from '@/lib/payables';
import { withReadOnlyTransaction, type RequestContext } from '@/server/db/transaction';

export async function getCashFlowPayload(
  context: RequestContext,
  today = nairobiToday(),
): Promise<CashFlowPayload> {
  const months = cashFlowWindow(12, today);
  const from = `${months[0]}-01`;
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthClose = monthEnd(today.slice(0, 7));

  return withReadOnlyTransaction(context, async (tx) => {
    const accounts = await tx.query<{ id: string; name: string; balance: string }>(
      `select a.id, a.name,
              gl.account_balance_as_at($1, a.id, $2::date)::text as balance
         from gl.accounts a
        where a.entity_id = $1
          and a.control_type in ('BANK', 'CASH')
          and a.is_postable
          and a.is_active
        order by a.code`,
      [context.entityId, today],
    );

    const closings = await tx.query<{ month: string; balance: string }>(
      `with months as (
         select generate_series(
                  date_trunc('month', $2::date),
                  date_trunc('month', $3::date),
                  interval '1 month'
                )::date as month_start
       )
       select to_char(m.month_start, 'YYYY-MM') as month,
              coalesce(sum(l.debit_base - l.credit_base), 0)::text as balance
         from months m
         left join gl.accounts a
           on a.entity_id = $1
          and a.control_type in ('BANK', 'CASH')
          and a.is_postable
          and a.is_active
         left join gl.journal_entry_line l
           on l.account_id = a.id
          and l.entity_id = $1
          and l.entry_date <= least(
                (m.month_start + interval '1 month' - interval '1 day')::date,
                $3::date
              )
        group by m.month_start
        order by m.month_start`,
      [context.entityId, from, today],
    );

    const movements = await tx.query<{ month: string; money_in: string; money_out: string }>(
      `select to_char(date_trunc('month', l.entry_date), 'YYYY-MM') as month,
              coalesce(sum(l.debit_base) filter (where l.debit_base > 0), 0)::text as money_in,
              coalesce(sum(l.credit_base) filter (where l.credit_base > 0), 0)::text as money_out
         from gl.journal_entry_line l
         join gl.accounts a on a.id = l.account_id
        where l.entity_id = $1
          and l.entry_date between $2::date and $3::date
          and a.control_type in ('BANK', 'CASH')
        group by 1`,
      [context.entityId, from, today],
    );

    const overdueInvoices = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(b.outstanding), 0)::text as amount
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.due_date < $2::date`,
      [context.entityId, today],
    );

    const openInvoices = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(b.outstanding), 0)::text as amount
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0
          and i.due_date >= $2::date`,
      [context.entityId, today],
    );

    const invoicePayments = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(r.amount), 0)::text as amount
         from sales.receipts r
        where r.entity_id = $1
          and r.status = 'POSTED'
          and r.receipt_date between $2::date and $3::date`,
      [context.entityId, monthStart, monthClose],
    );

    const salesReceipts = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(sr.total), 0)::text as amount
         from sales.sales_receipts sr
        where sr.entity_id = $1
          and sr.status = 'POSTED'
          and sr.receipt_date between $2::date and $3::date`,
      [context.entityId, monthStart, monthClose],
    );

    const overdueBills = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(bal.outstanding), 0)::text as amount
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and bal.outstanding > 0
          and b.due_date < $2::date`,
      [context.entityId, today],
    );

    const openBills = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(bal.outstanding), 0)::text as amount
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and bal.outstanding > 0
          and b.due_date >= $2::date`,
      [context.entityId, today],
    );

    const billPayments = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(p.amount), 0)::text as amount
         from purch.supplier_payments p
        where p.entity_id = $1
          and p.status = 'POSTED'
          and p.payment_date between $2::date and $3::date
          and not exists (
            select 1
              from purch.supplier_payment_allocations a
              join purch.bills b on b.id = a.bill_id
              join purch.v_bill_balances bal on bal.id = b.id
             where a.payment_id = p.id
               and b.due_date = b.bill_date
               and bal.outstanding = 0
               and not exists (
                 select 1
                   from purch.bill_lines l
                  where l.bill_id = b.id
                    and l.goods_receipt_line_id is not null
               )
          )`,
      [context.entityId, monthStart, monthClose],
    );

    const paidExpenses = await tx.one<{ qty: string; amount: string }>(
      `select count(*)::text as qty, coalesce(sum(b.total), 0)::text as amount
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and b.due_date = b.bill_date
          and bal.outstanding = 0
          and b.bill_date between $2::date and $3::date
          and not exists (
            select 1
              from purch.bill_lines l
             where l.bill_id = b.id
               and l.goods_receipt_line_id is not null
          )`,
      [context.entityId, monthStart, monthClose],
    );

    const scheduledIn = await tx.query<{ date: string; amount: string }>(
      `select i.due_date::text as date, b.outstanding::text as amount
         from sales.invoices i
         join sales.v_invoice_balances b on b.id = i.id
        where i.entity_id = $1
          and i.status = 'ISSUED'
          and b.outstanding > 0`,
      [context.entityId],
    );

    const scheduledOut = await tx.query<{ date: string; amount: string }>(
      `select b.due_date::text as date, bal.outstanding::text as amount
         from purch.bills b
         join purch.v_bill_balances bal on bal.id = b.id
        where b.entity_id = $1
          and b.status = 'POSTED'
          and bal.outstanding > 0`,
      [context.entityId],
    );

    const comingUp = await tx.query<{
      id: string;
      date: string;
      party: string;
      kind: string;
      amount: string;
      href: string;
    }>(
      `select id, date, party, kind, amount, href from (
         select i.id::text as id,
                i.due_date::text as date,
                c.legal_name as party,
                'Invoice'::text as kind,
                b.outstanding::text as amount,
                '/sales/invoices/' || i.id as href
           from sales.invoices i
           join sales.v_invoice_balances b on b.id = i.id
           join app.customers c on c.id = i.customer_id
          where i.entity_id = $1
            and i.status = 'ISSUED'
            and b.outstanding > 0
         union all
         select b.id::text,
                b.due_date::text,
                s.legal_name,
                'Bill',
                (0 - bal.outstanding)::text,
                '/purchasing/bills'
           from purch.bills b
           join purch.v_bill_balances bal on bal.id = b.id
           join app.suppliers s on s.id = b.supplier_id
          where b.entity_id = $1
            and b.status = 'POSTED'
            and bal.outstanding > 0
       ) upcoming
       order by date, party
       limit 8`,
      [context.entityId],
    );

    function bucket(row: { qty: string; amount: string }) {
      return { qty: Number(row.qty), amount: row.amount };
    }

    const cashToday = Money.sum(accounts.map((row) => row.balance))
      .toDecimal()
      .toString();
    const closingsByMonth = new Map(closings.map((row) => [row.month, row.balance]));
    const movementsByMonth = new Map(movements.map((row) => [row.month, row]));

    return {
      today,
      todayBalance: cashToday,
      accounts: accounts.map((row) => ({
        id: row.id,
        name: row.name,
        balance: row.balance,
      })),
      months: months.map((key) => ({
        key,
        actualBalance: closingsByMonth.get(key) ?? '0',
        moneyIn: movementsByMonth.get(key)?.money_in ?? '0',
        moneyOut: movementsByMonth.get(key)?.money_out ?? '0',
      })),
      moneyIn: {
        overdueInvoices: bucket(overdueInvoices),
        openInvoices: bucket(openInvoices),
        undeposited: { qty: 0, amount: '0' },
        invoicePayments: bucket(invoicePayments),
        salesReceipts: bucket(salesReceipts),
      },
      moneyOut: {
        overdueBills: bucket(overdueBills),
        openBills: bucket(openBills),
        billPayments: bucket(billPayments),
        paidExpenses: bucket(paidExpenses),
      },
      scheduled: [
        ...scheduledIn.map((row) => ({
          date: row.date,
          amount: row.amount,
          direction: 'in' as const,
        })),
        ...scheduledOut.map((row) => ({
          date: row.date,
          amount: row.amount,
          direction: 'out' as const,
        })),
      ],
      comingUp: comingUp.map((row) => ({
        id: row.id,
        date: row.date,
        party: row.party,
        kind: row.kind === 'Bill' ? 'Bill' : 'Invoice',
        amount: row.amount,
        href: row.href,
      })),
    };
  });
}
