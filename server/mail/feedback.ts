import { escapeHtml } from './access-email';
import { sendTransactionalEmail } from './send';
import {
  DEFAULT_FEEDBACK_RECIPIENTS,
  feedbackPageTitle,
  feedbackScopeLabel,
  feedbackTopicLabel,
  mergeFeedbackRecipients,
} from '@/lib/feedback';
import { ConfigurationError } from '@/server/db/errors';

export function feedbackEmail(input: {
  senderName: string;
  senderEmail: string;
  companyName: string;
  topic: string;
  scope?: string;
  message: string;
  page: string;
  pageTitle?: string;
}): { subject: string; text: string; html: string } {
  const topic = feedbackTopicLabel(input.topic);
  const scope = feedbackScopeLabel(input.scope ?? 'this_page');
  const company = input.companyName.trim() || 'SkyJet';
  const sender = input.senderName.trim() || input.senderEmail || 'A signed-in user';
  const page = input.page.trim() || 'not specified';
  const pageTitle = input.pageTitle?.trim() || feedbackPageTitle(page);
  const about = input.scope === 'something_else' ? 'Something else' : pageTitle;
  const subject = `[SkyJet feedback] ${about} — ${company}`;

  const text = [
    `${sender} (${input.senderEmail || 'no email on the account'}) sent feedback from ${company}.`,
    `About: ${scope} — ${pageTitle} (${page})`,
    `What's going on: ${topic}`,
    '',
    input.message.trim(),
    '',
    'Reply to this email to reach the person who sent it.',
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
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#71717a;">SkyJet feedback</p>
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${escapeHtml(about)}</h1>
                <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">
                  <strong>${escapeHtml(sender)}</strong>
                  ${input.senderEmail ? `&lt;${escapeHtml(input.senderEmail)}&gt;` : ''}
                </p>
                <p style="margin:0 0 8px;font-size:14px;color:#52525b;">Company: ${escapeHtml(company)}</p>
                <p style="margin:0 0 8px;font-size:14px;color:#52525b;">${escapeHtml(scope)}: ${escapeHtml(pageTitle)} (${escapeHtml(page)})</p>
                <p style="margin:0 0 16px;font-size:14px;color:#52525b;">${escapeHtml(topic)}</p>
                <pre style="margin:0;padding:16px;background:#f4f4f5;border-radius:8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(input.message.trim())}</pre>
                <p style="margin:16px 0 0;font-size:12px;color:#71717a;">Reply to this email to reach the person who sent it.</p>
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

export function feedbackRecipients(): string[] {
  return mergeFeedbackRecipients(
    DEFAULT_FEEDBACK_RECIPIENTS,
    process.env.MAIL_FEEDBACK_TO,
    process.env.MAIL_REPLY_TO,
  );
}

export async function sendFeedbackEmail(input: {
  senderName: string;
  senderEmail: string;
  companyName: string;
  topic: string;
  scope?: string;
  message: string;
  page: string;
  pageTitle?: string;
}): Promise<{ id: string }> {
  const to = feedbackRecipients();
  if (to.length === 0) {
    throw new ConfigurationError(
      'No feedback recipients are configured. Set MAIL_FEEDBACK_TO or keep the default developer addresses.',
    );
  }

  const message = feedbackEmail(input);
  const replyTo = input.senderEmail.trim();

  return sendTransactionalEmail({
    to,
    fromName: 'SkyJet feedback',
    replyTo: replyTo || undefined,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tags: [{ name: 'category', value: 'feedback' }],
  });
}
