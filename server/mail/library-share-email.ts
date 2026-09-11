import { escapeHtml } from './access-email';

export function libraryDocumentShareEmail(input: {
  companyName: string;
  recipientName: string;
  sharerName: string;
  documentTitle: string;
  documentUrl: string;
  note?: string | null;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || 'the company';
  const firstName = input.recipientName.trim().split(/\s+/)[0] || 'there';
  const sharer = input.sharerName.trim() || 'A colleague';
  const title = input.documentTitle.trim() || 'a document';
  const note = input.note?.trim() || '';

  const subject = `${sharer} shared a Library file with you`;
  const intro = `${firstName}, ${sharer} shared “${title}” with you in ${company} Library.`;

  const text = [
    intro,
    '',
    'Sign in to Skyjet to open the file. The file is not attached to this email.',
    input.documentUrl,
    note ? `\nNote from ${sharer}:\n${note}` : null,
    '',
    'If you were not expecting this, you can ignore the email.',
  ]
    .filter((row): row is string => row !== null)
    .join('\n');

  const noteHtml = note
    ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#3f3f46;white-space:pre-wrap;">Note from ${escapeHtml(sharer)}:<br />${escapeHtml(note)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">${escapeHtml(company)}</p>
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">A Library file was shared with you</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
                ${noteHtml}
                <p style="margin:0 0 24px;">
                  <a href="${escapeHtml(input.documentUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;">
                    Open in Library
                  </a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#52525b;">
                  Sign in with your Skyjet account. The file is not attached to this email.<br />
                  If the button does not work, paste this link into your browser:<br />
                  <span style="word-break:break-all;">${escapeHtml(input.documentUrl)}</span>
                </p>
                <p style="margin:0;font-size:12px;color:#71717a;">If you were not expecting this, you can ignore the email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
