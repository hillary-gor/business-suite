import { describe, expect, it } from 'vitest';
import { libraryDocumentShareEmail } from './library-share-email';

describe('libraryDocumentShareEmail', () => {
  it('escapes titles and notes so they cannot inject markup', () => {
    const email = libraryDocumentShareEmail({
      companyName: 'Airzone <Parts>',
      recipientName: 'Hillary',
      sharerName: 'Ada',
      documentTitle: `CMM <script>alert('x')</script>`,
      documentUrl: 'https://example.test/library/documents/abc',
      note: 'See <img src=x onerror=alert(1)>',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Airzone &lt;Parts&gt;');
    expect(email.text).toContain('https://example.test/library/documents/abc');
    expect(email.text).toContain('The file is not attached');
  });

  it('names the sharer and the file', () => {
    const email = libraryDocumentShareEmail({
      companyName: 'Airzone Parts',
      recipientName: 'Hillary Gor',
      sharerName: 'Ada Lovelace',
      documentTitle: 'Engine CMM',
      documentUrl: 'https://example.test/library/documents/abc',
    });
    expect(email.subject).toContain('Ada Lovelace');
    expect(email.text).toContain('Engine CMM');
    expect(email.html).toContain('Open in Library');
  });
});
