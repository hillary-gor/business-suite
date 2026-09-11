import { toCsv } from '@/lib/payables';

export function csvFilename(parts: readonly string[]): string {
  const stem = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('-')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return `${stem || 'report'}.csv`;
}

export function csvWithBom(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return `\uFEFF${toCsv(rows)}`;
}

/** Triggers a CSV download. Call only from a user click on the client. */
export function downloadCsv(
  filename: string,
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): void {
  const blob = new Blob([csvWithBom(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
