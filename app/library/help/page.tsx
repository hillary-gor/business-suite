import Link from 'next/link';
import { PageHeader } from '@/components/ui';
import { LIBRARY_GUIDE_SECTIONS } from '@/app/library/guide';

export const metadata = { title: 'How Library works · Skyjet Library' };

export default function LibraryHelpPage() {
  return (
    <>
      <PageHeader
        title="How Library works"
        description="A guide for someone opening Skyjet Library for the first time. Jump to a topic, then open the screen it describes."
      />

      <div className="library-guide">
        <nav className="library-guide__toc" aria-label="Guide topics">
          <p className="library-guide__toc-label">On this page</p>
          {LIBRARY_GUIDE_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title}
            </a>
          ))}
        </nav>

        <article className="library-guide__article">
          {LIBRARY_GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && section.bullets.length > 0 ? (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {section.links && section.links.length > 0 ? (
                <p className="library-guide__links">
                  {section.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="button button--ghost button--small"
                    >
                      {link.label}
                    </Link>
                  ))}
                </p>
              ) : null}
            </section>
          ))}
        </article>
      </div>
    </>
  );
}
