import { displayCurrency } from '@/lib/inventory-overview';
import { formatMoney, formatQuantity } from '@/lib/money';
import { formatDisplayDate } from '@/lib/payables';
import { escapeHtml } from './access-email';

export function purchaseOrderEmail(input: {
  companyName: string;
  poNo: string | null;
  supplierName: string;
  orderDate: string;
  expectedDate: string | null;
  currencyCode: string;
  message?: string | null;
  memo?: string | null;
  lines: ReadonlyArray<{
    description: string;
    quantity: string;
    unitPrice: string;
    lineNet: string;
    taxAmount: string;
  }>;
  subtotal: string;
  taxTotal: string;
  total: string;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || 'SkyJet Aircraft Spares';
  const poLabel = input.poNo ? `Purchase order ${input.poNo}` : 'Purchase order';
  const money = (amount: string) =>
    formatMoney(amount, { currency: displayCurrency(input.currencyCode), showCurrency: true });
  const subject = `${poLabel} from ${company}`;
  const due = input.expectedDate ? formatDisplayDate(input.expectedDate) : null;

  const textLines = [
    `${poLabel} from ${company}`,
    `Supplier: ${input.supplierName}`,
    `Date: ${formatDisplayDate(input.orderDate)}`,
    due ? `Due: ${due}` : null,
    '',
    ...input.lines.map(
      (line) =>
        `${line.description} — ${formatQuantity(line.quantity)} x ${money(line.unitPrice)} = ${money(line.lineNet)} (tax ${money(line.taxAmount)})`,
    ),
    '',
    `Subtotal: ${money(input.subtotal)}`,
    `Tax: ${money(input.taxTotal)}`,
    `Total: ${money(input.total)}`,
    input.message?.trim() ? `\n${input.message.trim()}` : null,
    input.memo?.trim() ? `\nMemo: ${input.memo.trim()}` : null,
  ].filter((row): row is string => row !== null);

  const lineRows = input.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;">${escapeHtml(line.description)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;">${escapeHtml(formatQuantity(line.quantity))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;">${escapeHtml(money(line.unitPrice))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;">${escapeHtml(money(line.lineNet))}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e4e4e7;text-align:right;">${escapeHtml(money(line.taxAmount))}</td>
      </tr>`,
    )
    .join('');

  const note = input.message?.trim()
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(input.message.trim())}</p>`
    : '';
  const memo = input.memo?.trim()
    ? `<p style="margin:12px 0 0;font-size:13px;color:#52525b;">Memo: ${escapeHtml(input.memo.trim())}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">${escapeHtml(company)}</p>
                <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;">${escapeHtml(poLabel)}</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#52525b;">
                  Supplier: ${escapeHtml(input.supplierName)}<br />
                  Date: ${escapeHtml(formatDisplayDate(input.orderDate))}${due ? `<br />Due: ${escapeHtml(due)}` : ''}
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e4e4e7;border-radius:8px;border-collapse:collapse;">
                  <tr style="background:#f4f4f5;">
                    <th align="left" style="padding:8px 10px;font-size:12px;">Description</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;">Qty</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;">Rate</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;">Amount</th>
                    <th align="right" style="padding:8px 10px;font-size:12px;">Tax</th>
                  </tr>
                  ${lineRows}
                </table>
                <p style="margin:16px 0 0;font-size:14px;text-align:right;line-height:1.6;">
                  Subtotal ${escapeHtml(money(input.subtotal))}<br />
                  Tax ${escapeHtml(money(input.taxTotal))}<br />
                  <strong>Total ${escapeHtml(money(input.total))}</strong>
                </p>
                ${note}
                ${memo}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text: textLines.join('\n'), html };
}
