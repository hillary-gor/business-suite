import { describe, expect, it } from 'vitest';
import { accessEmail, escapeHtml } from './access-email';

describe('accessEmail', () => {
  it('escapes names so they cannot inject markup', () => {
    expect(escapeHtml(`A <script>alert('x')</script> & Co`)).toBe(
      'A &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; Co',
    );
  });

  it('builds an invite that names the company and role', () => {
    const email = accessEmail({
      kind: 'invite',
      companyName: 'Airzone Parts',
      recipientName: 'Hillary Gor',
      roleName: 'Sales',
      actionUrl: 'https://example.test/invite',
    });
    expect(email.subject).toContain('Airzone Parts');
    expect(email.text).toContain('as Sales');
    expect(email.text).toContain('https://example.test/invite');
    expect(email.html).toContain('Set your password');
    expect(email.html).not.toContain('<script>');
  });

  it('does not leak a role into a password-reset email', () => {
    const email = accessEmail({
      kind: 'recovery',
      companyName: 'Airzone Parts',
      recipientName: 'Hillary',
      actionUrl: 'https://example.test/reset',
    });
    expect(email.subject).toMatch(/password/i);
    expect(email.text).not.toContain('as Sales');
  });
});
