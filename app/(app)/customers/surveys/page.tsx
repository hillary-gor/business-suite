import { redirect } from 'next/navigation';
import { SURVEY_SETTINGS_HREF } from '@/lib/customer-hub';

export const metadata = { title: 'Survey settings · SkyJet' };

export default function SurveysPage() {
  redirect(SURVEY_SETTINGS_HREF);
}
