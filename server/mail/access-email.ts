export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type AccessEmailKind = 'invite' | 'recovery';

export function accessEmail(input: {
  kind: AccessEmailKind;
  companyName: string;
  recipientName: string;
  roleName?: string | null;
  actionUrl: string;
}): { subject: string; text: string; html: string } {
  const company = input.companyName.trim() || 'the company';
  const firstName = input.recipientName.trim().split(/\s+/)[0] || 'there';
  const role = input.roleName?.trim();
  const isInvite = input.kind === 'invite';

  const subject = isInvite
    ? `You have been invited to ${company}`
    : `Set your password for ${company}`;

  const intro = isInvite
    ? `${firstName}, you have been given access to ${company}${role ? ` as ${role}` : ''}.`
    : `${firstName}, use this link to set a password for ${company}.`;

  const text = [
    intro,
    '',
    'Open this link to choose a password, then sign in with your email address:',
    input.actionUrl,
    '',
    'The link expires in 24 hours. If you were not expecting this, ignore the email.',
  ].join('\n');

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
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${isInvite ? 'You have been invited' : 'Set your password'}</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${escapeHtml(intro)}</p>
                <p style="margin:0 0 24px;">
                  <a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;">
                    Set your password
                  </a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#52525b;">
                  If the button does not work, paste this link into your browser:<br />
                  <span style="word-break:break-all;">${escapeHtml(input.actionUrl)}</span>
                </p>
                <p style="margin:0;font-size:12px;color:#71717a;">The link expires in 24 hours. If you were not expecting this, ignore the email.</p>
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
