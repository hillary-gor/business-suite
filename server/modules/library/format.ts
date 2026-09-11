export function formatLibraryFileSize(value: string): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = (bytes - (bytes % 1024)) / 1024;
  if (kb < 1024) return `${kb} KB`;
  const mb = (kb - (kb % 1024)) / 1024;
  return `${mb} MB`;
}
