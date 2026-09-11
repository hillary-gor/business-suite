import { SKYJET_MARK } from '@/lib/brand';

export function SkyjetMark({
  className,
  size = 40,
  alt = 'Skyjet',
}: {
  className?: string;
  size?: number;
  alt?: string;
}) {
  return (
    // The mark is a raster brand asset; next/image is unnecessary at this size.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SKYJET_MARK}
      alt={alt}
      width={size}
      height={size}
      className={className ?? 'skyjet-mark'}
    />
  );
}
