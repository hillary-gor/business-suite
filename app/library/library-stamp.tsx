'use client';

import { useEffect, useState } from 'react';
import {
  formatLibraryStamp,
  LIBRARY_DISPLAY_TIME_ZONE,
  parseLibraryInstant,
} from '@/lib/library-time';

export function LibraryStamp({
  value,
  empty = '',
}: {
  value: string | null | undefined;
  empty?: string;
}) {
  const [text, setText] = useState(() => formatLibraryStamp(value, LIBRARY_DISPLAY_TIME_ZONE));

  useEffect(() => {
    setText(formatLibraryStamp(value, Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, [value]);

  if (!value || !text) return empty ? <>{empty}</> : null;

  const instant = parseLibraryInstant(value);
  return <time dateTime={instant?.toISOString()}>{text}</time>;
}
