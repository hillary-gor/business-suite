'use client';

import { useState, useTransition } from 'react';
import { saveEntityAction, saveEntityLogoAction, clearEntityLogoAction } from '@/server/actions/settings';
import { Alert, Field } from '@/components/ui';
import { CompanyLogo } from '@/components/brand/company-logo';
import { DotsLoader } from '@/components/loading/dots-loader';
import { DEFAULT_COMPANY_LOGO } from '@/lib/brand';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function CompanySettingsForm({
  profile,
  showAdditional = true,
}: {
  profile: {
    code: string;
    legalName: string;
    tradingName: string | null;
    taxPin: string | null;
    registrationNumber: string | null;
    countryCode: string;
    baseCurrency: string;
    fiscalYearStartMonth: number;
    timezone: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    logoSrc: string;
    hasCustomLogo: boolean;
  };
  showAdditional?: boolean;
}) {
  const [legalName, setLegalName] = useState(profile.legalName);
  const [tradingName, setTradingName] = useState(profile.tradingName ?? '');
  const [email, setEmail] = useState(profile.email ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [addressLine1, setAddressLine1] = useState(profile.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(profile.addressLine2 ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [postalCode, setPostalCode] = useState(profile.postalCode ?? '');
  const [taxPin, setTaxPin] = useState(profile.taxPin ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(profile.registrationNumber ?? '');
  const [countryCode, setCountryCode] = useState(profile.countryCode);
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState(profile.fiscalYearStartMonth);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [logoPending, startLogoTransition] = useTransition();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveEntityAction({
        legalName,
        tradingName,
        email,
        phone,
        addressLine1,
        addressLine2,
        city,
        postalCode,
        taxPin,
        registrationNumber,
        countryCode,
        fiscalYearStartMonth,
        timezone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSaved(false);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      setLogoPreview(result);
      startLogoTransition(async () => {
        const uploaded = await saveEntityLogoAction({
          mimeType: file.type,
          base64,
        });
        if (!uploaded.ok) {
          setError(uploaded.error);
          setLogoPreview(null);
          return;
        }
        setSaved(true);
      });
    };
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    setError(null);
    setSaved(false);
    startLogoTransition(async () => {
      const result = await clearEntityLogoAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLogoPreview(DEFAULT_COMPANY_LOGO);
      setSaved(true);
    });
  }

  return (
    <div className="stack">
      {error ? <Alert title="Could not save">{error}</Alert> : null}
      {saved ? <Alert tone="success" title="Saved">Company details updated.</Alert> : null}

      <div className="logo-setup">
        <CompanyLogo
          src={logoPreview ?? profile.logoSrc}
          alt={legalName || 'Company logo'}
          className="logo-setup__preview"
        />
        <div className="stack">
          <div className="drawer__section-title">Company logo</div>
          <p className="cell-muted">
            Shown in the app and on invoices, receipts and other documents when Logo is turned on.
            Until you upload your own, the Surge Innovations mark is used.
          </p>
          <div className="button-row">
            <label className="button">
              {logoPending ? <DotsLoader label="Uploading" /> : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                disabled={logoPending}
                onChange={(e) => {
                  onLogoFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {profile.hasCustomLogo || logoPreview ? (
              <button type="button" className="button button--ghost" disabled={logoPending} onClick={resetLogo}>
                Use default
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="form-grid">
        <Field label="Legal name" htmlFor="legalName" required>
          <input id="legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>
        <Field label="Trading name" htmlFor="tradingName">
          <input
            id="tradingName"
            value={tradingName}
            onChange={(e) => setTradingName(e.target.value)}
          />
        </Field>
        <Field label="Company email" htmlFor="companyEmail">
          <input
            id="companyEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="companyPhone">
          <input id="companyPhone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Entity code" htmlFor="entityCode" hint="Assigned at setup and cannot be changed here.">
          <input id="entityCode" value={profile.code} disabled />
        </Field>
        <Field
          label="Functional currency"
          htmlFor="baseCurrency"
          hint="Changing this would rewrite the books; it is locked."
        >
          <input id="baseCurrency" value={profile.baseCurrency} disabled />
        </Field>
      </div>

      <Field label="Address line 1" htmlFor="address1">
        <input id="address1" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
      </Field>
      <Field label="Address line 2" htmlFor="address2">
        <input id="address2" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="City" htmlFor="city">
          <input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field label="Postal code" htmlFor="postalCode">
          <input id="postalCode" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </Field>
      </div>

      {showAdditional ? (
        <div id="additional" className="stack">
          <div className="drawer__section-title">Additional info</div>
          <div className="form-grid">
            <Field label="KRA PIN" htmlFor="taxPin">
              <input id="taxPin" value={taxPin} onChange={(e) => setTaxPin(e.target.value)} />
            </Field>
            <Field label="Company registration number" htmlFor="regNo">
              <input
                id="regNo"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
              />
            </Field>
            <Field label="Country" htmlFor="country">
              <input
                id="country"
                value={countryCode}
                maxLength={2}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Fiscal year starts" htmlFor="fyMonth">
              <select
                id="fyMonth"
                value={fiscalYearStartMonth}
                onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
              >
                {MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Timezone" htmlFor="timezone">
              <input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : null}

      <div className="button-row">
        <button type="button" className="button button--primary" disabled={pending} onClick={submit}>
          {pending ? <DotsLoader label="Saving" tone="inverse" /> : 'Save'}
        </button>
      </div>
    </div>
  );
}
