import { describe, expect, it } from 'vitest';
import { formatLibraryStamp, parseLibraryInstant } from '@/lib/library-time';

describe('library timestamps', () => {
  it('treats naive to_char output as UTC and shows East Africa Time', () => {
    expect(formatLibraryStamp('2026-09-07 17:03', 'Africa/Nairobi')).toBe('2026-09-07 20:03');
  });

  it('keeps an explicit offset', () => {
    expect(formatLibraryStamp('2026-09-07T17:03:00.000Z', 'Africa/Nairobi')).toBe(
      '2026-09-07 20:03',
    );
    expect(formatLibraryStamp('2026-09-07 17:03:00+00', 'Africa/Nairobi')).toBe('2026-09-07 20:03');
  });

  it('formats in the viewer timezone when asked', () => {
    expect(formatLibraryStamp('2026-09-07 17:03', 'UTC')).toBe('2026-09-07 17:03');
    expect(formatLibraryStamp('2026-09-07 17:03', 'Europe/London')).toBe('2026-09-07 18:03');
  });

  it('parses nothing useful as null', () => {
    expect(parseLibraryInstant('')).toBeNull();
    expect(parseLibraryInstant('not-a-date')?.getTime() ?? null).toBeNull();
  });
});
