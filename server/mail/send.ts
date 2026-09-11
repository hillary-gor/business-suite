import { Resend } from 'resend';
import { BusinessRuleError, ConfigurationError } from '@/server/db/errors';

const DEFAULT_FROM_ADDRESS = 'invite@skyjetaircraftspares.com';
const DEFAULT_FROM_NAME = 'SkyJet Aircraft Spares';

export function mailFromAddress(): string {
  return process.env.MAIL_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS;
}

export function mailFromName(companyName?: string | null): string {
  const configured = process.env.MAIL_FROM_NAME?.trim();
  if (configured) return configured;
  if (companyName?.trim()) return companyName.trim();
  return DEFAULT_FROM_NAME;
}

export function mailReplyTo(): string | undefined {
  const value = process.env.MAIL_REPLY_TO?.trim();
  return value || undefined;
}

export async function sendTransactionalEmail(input: {
  to: string | readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{ filename: string; content: Buffer }>;
}): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigurationError(
      'RESEND_API_KEY is not set. Add it on this host as a Secret so emails can be sent.',
    );
  }

  const to = (typeof input.to === 'string' ? [input.to] : [...input.to])
    .map((address) => address.trim())
    .filter(Boolean);
  if (to.length === 0) {
    throw new BusinessRuleError('The email could not be sent.');
  }

  const resend = new Resend(apiKey);
  const from = `${mailFromName(input.fromName)} <${mailFromAddress()}>`;
  const { data, error } = await resend.emails.send({
    from,
    to,
    cc: input.cc?.length ? [...input.cc] : undefined,
    bcc: input.bcc?.length ? [...input.bcc] : undefined,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo?.trim() || mailReplyTo(),
    tags: input.tags,
    attachments: input.attachments?.map((file) => ({
      filename: file.filename,
      content: file.content,
    })),
  });

  if (error) {
    throw new BusinessRuleError(error.message || 'The email could not be sent.');
  }
  if (!data?.id) {
    throw new BusinessRuleError('The email could not be sent.');
  }
  return { id: data.id };
}
