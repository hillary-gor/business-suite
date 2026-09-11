import { Permission } from '@/server/auth/permissions';
import { authorise } from '@/server/auth/session';
import { getSalesSurveySettings } from '@/server/modules/settings/survey';
import { Card, PageHeader } from '@/components/ui';
import { SalesSettingsEditor } from './sales-settings';

export const metadata = { title: 'Post-invoice survey · SkyJet' };

export default async function SalesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { context, entity } = await authorise(Permission.SettingsManage);
  const settings = await getSalesSurveySettings(context);
  const params = await searchParams;

  return (
    <>
      <PageHeader
        title="Post-invoice survey"
        description="Ask for another job, a review, or a referral after you invoice. Questions stay off until you turn them on here."
      />
      <Card>
        <SalesSettingsEditor
          initial={settings}
          companyName={entity.name}
          openSurvey={params.section === 'survey'}
        />
      </Card>
    </>
  );
}
