import Link from 'next/link';
import type { LibrarySeriesPoint } from '@/server/modules/library/types';

export function LibraryBarList({
  items,
}: {
  items: readonly { label: string; count: number; href?: string }[];
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <ul className="library-bars">
      {items.map((item) => {
        const bar = (
          <>
            <span className="library-bars__label">{item.label}</span>
            <span className="library-bars__track">
              <span
                className="library-bars__fill"
                style={{ width: `${Math.round((item.count / max) * 100)}%` }}
              />
            </span>
            <span className="library-bars__n">{String(item.count)}</span>
          </>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className="library-bars__row">
                {bar}
              </Link>
            ) : (
              <div className="library-bars__row">{bar}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function LibraryColumnChart({
  points,
  dense = false,
  ariaLabel,
}: {
  points: readonly LibrarySeriesPoint[];
  dense?: boolean;
  ariaLabel: string;
}) {
  const max = Math.max(...points.map((point) => point.count), 1);
  const last = points.length - 1;
  return (
    <div
      className={dense ? 'library-cols library-cols--dense' : 'library-cols'}
      role="img"
      aria-label={ariaLabel}
    >
      {points.map((point, index) => {
        const showTick = dense
          ? index === 0 || index === last || index % 7 === 0
          : index === 0 || index === last || index % 2 === 0;
        const height = point.count === 0 ? 2 : Math.max(6, Math.round((point.count / max) * 100));
        return (
          <div
            key={point.period}
            className="library-cols__item"
            title={`${point.label}: ${point.count}`}
          >
            <span className="library-cols__plot">
              <span className="library-cols__bar" style={{ height: `${height}%` }} />
            </span>
            <span className={showTick ? 'library-cols__tick' : 'library-cols__tick is-hidden'}>
              {showTick ? point.label : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}
