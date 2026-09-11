import { PlatformModule } from '@/lib/platform/modules';
import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getEntityProfile } from '@/server/modules/settings/company';
import { Card, PageHeader } from '@/components/ui';
import { CompanySettingsForm } from '@/app/(app)/settings/company/company-form';
import { entityLogoSrc } from '@/lib/brand';

export const metadata = { title: 'Organisation · Skyjet Library' };

export default async function LibraryCompanySettingsPage() {
  const { context } = await authorise(Permission.SettingsManage, {
    module: PlatformModule.Library,
  });
  const profile = await getEntityProfile(context);

  return (
    <>
      <PageHeader
        title="Organisation"
        description="The same company record used across Skyjet. Changing the name here changes it in Business Suite too."
      />
      <Card>
        <CompanySettingsForm
          profile={{
            code: profile.code,
            legalName: profile.legal_name,
            tradingName: profile.trading_name,
            taxPin: profile.tax_pin,
            registrationNumber: profile.registration_number,
            countryCode: profile.country_code,
            baseCurrency: profile.base_currency_code,
            fiscalYearStartMonth: profile.fiscal_year_start_month,
            timezone: profile.timezone,
            addressLine1: profile.address_line1,
            addressLine2: profile.address_line2,
            city: profile.city,
            postalCode: profile.postal_code,
            phone: profile.phone,
            email: profile.email,
            logoSrc: entityLogoSrc(profile.has_logo, profile.updated_at),
            hasCustomLogo: profile.has_logo,
          }}
        />
      </Card>
    </>
  );
}
