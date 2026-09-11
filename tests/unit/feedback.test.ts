import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEEDBACK_RECIPIENTS,
  feedbackPageTitle,
  feedbackScopeLabel,
  feedbackTopicLabel,
  mergeFeedbackRecipients,
  safeFeedbackPage,
} from '@/lib/feedback';
import { feedbackEmail } from '@/server/mail/feedback';

describe('feedback recipients', () => {
  it('always includes the developer inboxes and de-duplicates extras', () => {
    expect(mergeFeedbackRecipients(DEFAULT_FEEDBACK_RECIPIENTS)).toEqual([
      'khilary4600@gmail.com',
      'surgeinnovationsltd@gmail.com',
    ]);
    expect(
      mergeFeedbackRecipients(
        DEFAULT_FEEDBACK_RECIPIENTS,
        'Khilary4600@gmail.com, extra@skyjet.test; not-an-email',
        'info@skyjet.test',
      ),
    ).toEqual([
      'khilary4600@gmail.com',
      'surgeinnovationsltd@gmail.com',
      'extra@skyjet.test',
      'info@skyjet.test',
    ]);
  });
});

describe('feedback page titles', () => {
  it('names the screen the person is on, including composers and record pages', () => {
    expect(feedbackPageTitle('/reports/performance')).toBe('Performance centre');
    expect(feedbackPageTitle('/reports/cash-flow')).toBe('Cash flow overview');
    expect(feedbackPageTitle('/sales/invoices/new')).toBe('New invoice');
    expect(feedbackPageTitle('/sales/invoices/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'Invoices',
    );
    expect(feedbackPageTitle('/reports/unknown-slug')).toBe('Standard reports');
    expect(safeFeedbackPage('/reports/performance')).toBe('/reports/performance');
    expect(safeFeedbackPage('https://evil.example')).toBe('');
    expect(feedbackTopicLabel('missing_feature')).toBe('A feature is missing');
    expect(feedbackScopeLabel('something_else')).toBe('Something else');
  });
});

describe('feedback email', () => {
  it('names the current page and escapes the message body', () => {
    const email = feedbackEmail({
      senderName: 'Hillary <script>',
      senderEmail: 'hillary@example.test',
      companyName: 'Airzone Parts',
      topic: 'bug',
      scope: 'this_page',
      message: 'The total is <b>wrong</b> & "off"',
      page: '/reports/performance',
      pageTitle: 'Performance centre',
    });
    expect(email.subject).toContain('Performance centre');
    expect(email.text).toContain('This page — Performance centre (/reports/performance)');
    expect(email.html).toContain('Hillary &lt;script&gt;');
    expect(email.html).toContain('The total is &lt;b&gt;wrong&lt;/b&gt; &amp; &quot;off&quot;');
    expect(email.html).not.toContain('<script>');
  });
});
