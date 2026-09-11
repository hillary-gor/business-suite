/** Company default; used for SSR so Kenya staff see EAT before the browser timezone is known. */
export const LIBRARY_DISPLAY_TIME_ZONE = 'Africa/Nairobi';

const HAS_ZONE = /[zZ]$|[+-]\d{2}(?::?\d{2})?$/;
const NAIVE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/**
 * Library queries stringify timestamps with `to_char` in the database session
 * timezone (UTC on hosted Postgres). A naive `YYYY-MM-DD HH:MM` is therefore
 * UTC, not local time. ISO strings from Realtime keep their own offset.
 */
export function parseLibraryInstant(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (HAS_ZONE.test(trimmed)) {
    const withT = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    const normalised = withT.replace(/([+-]\d{2})(\d{2})$/, '$1:$2').replace(/([+-]\d{2})$/, '$1:00');
    const date = new Date(normalised);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const naive = NAIVE.exec(trimmed);
  if (naive) {
    const date = new Date(`${naive[1]}T${naive[2]}:${naive[3] ?? '00'}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLibraryStamp(
  value: string | null | undefined,
  timeZone: string = LIBRARY_DISPLAY_TIME_ZONE,
): string {
  if (!value) return '';
  const date = parseLibraryInstant(value);
  if (!date) return value;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${read('year')}-${read('month')}-${read('day')} ${read('hour')}:${read('minute')}`;
}
