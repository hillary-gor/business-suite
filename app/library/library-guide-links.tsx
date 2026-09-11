import Link from 'next/link';
import { LIBRARY_GUIDE_HREF, LIBRARY_GUIDE_QUICK_LINKS } from '@/app/library/guide';

export function LibraryGuideLinks({
  lead = 'New here? Open a topic and learn as you go.',
}: {
  lead?: string;
}) {
  return (
    <p className="library-guide-jump">
      <span>{lead} </span>
      <Link href={LIBRARY_GUIDE_HREF}>How Library works</Link>
      <span className="library-guide-jump__sep"> · </span>
      {LIBRARY_GUIDE_QUICK_LINKS.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? <span className="library-guide-jump__sep"> · </span> : null}
          <Link href={link.href}>{link.label}</Link>
        </span>
      ))}
    </p>
  );
}
