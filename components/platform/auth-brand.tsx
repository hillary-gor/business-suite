import { SkyjetMark } from '@/components/platform/skyjet-mark';

export function PlatformAuthBrand({
  title = 'Sign in',
  description = 'Use your Skyjet account to open every module your organisation is entitled to.',
}: {
  title?: string;
  description?: string | null;
}) {
  return (
    <header className="signin__identity">
      <SkyjetMark className="signin__logo" size={56} />
      <p className="signin__kicker">Skyjet ERP</p>
      <p className="signin__brand">Skyjet Portal</p>
      <h1 className="signin__title">{title}</h1>
      {description ? <p className="signin__sub">{description}</p> : null}
    </header>
  );
}
