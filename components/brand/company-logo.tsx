import { DEFAULT_COMPANY_LOGO } from '@/lib/brand';

export function CompanyLogo({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    // The mark is an uploaded (or default) raster; next/image is unnecessary for a small brand asset.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src || DEFAULT_COMPANY_LOGO} alt={alt} className={className ?? 'brand-logo'} />
  );
}

export function PoweredBySurge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`powered-by${compact ? ' powered-by--compact' : ''}`}>
      <span>Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={DEFAULT_COMPANY_LOGO} alt="Surge Innovations" />
    </div>
  );
}
