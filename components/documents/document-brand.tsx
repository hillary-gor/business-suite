import { CompanyLogo, PoweredBySurge } from '@/components/brand/company-logo';

export type DocumentEntityBrand = {
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  logoSrc: string;
};

export function DocumentBrand({
  name,
  registrationNumber,
  showRegistration,
  logoSrc,
}: {
  name: string;
  registrationNumber?: string | null;
  showRegistration?: boolean;
  logoSrc: string;
}) {
  return (
    <div className="doc-sheet__brand">
      <CompanyLogo src={logoSrc} alt={name} className="doc-sheet__logo-img" />
      <div>
        <div className="doc-sheet__company">{name}</div>
        {showRegistration && registrationNumber ? (
          <div className="cell-muted">Reg. {registrationNumber}</div>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentPoweredBy() {
  return (
    <div className="doc-sheet__powered">
      <PoweredBySurge compact />
    </div>
  );
}
