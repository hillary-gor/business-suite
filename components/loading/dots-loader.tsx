export function DotsLoader({
  label = 'Loading',
  tone = 'brand',
}: {
  label?: string;
  tone?: 'brand' | 'inverse';
}) {
  return (
    <span className={`dots-loader dots-loader--${tone}`} role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </span>
  );
}

export function BusyLabel({
  pending,
  idle,
  tone = 'brand',
}: {
  pending: boolean;
  idle: string;
  tone?: 'brand' | 'inverse';
}) {
  return pending ? <DotsLoader label={idle} tone={tone} /> : idle;
}
