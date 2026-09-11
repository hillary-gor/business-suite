import { accessEmail, type AccessEmailKind } from './access-email';
import { sendTransactionalEmail } from './send';

export async function sendAccessEmail(input: {
  kind: AccessEmailKind;
  to: string;
  recipientName: string;
  companyName: string;
  roleName?: string | null;
  actionUrl: string;
}): Promise<void> {
  const message = accessEmail({
    kind: input.kind,
    companyName: input.companyName,
    recipientName: input.recipientName,
    roleName: input.roleName,
    actionUrl: input.actionUrl,
  });
  await sendTransactionalEmail({
    to: input.to,
    fromName: input.companyName,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tags: [{ name: 'category', value: input.kind }],
  });
}
