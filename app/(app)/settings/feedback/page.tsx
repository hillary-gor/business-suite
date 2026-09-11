import { PageHeader } from '@/components/ui';
import { FeedbackPageOpen } from './open';

export const metadata = { title: 'Feedback · SkyJet' };

export default function FeedbackPage() {
  return (
    <>
      <PageHeader
        title="Give feedback"
        description="Feedback opens on the page you are using, so we can see what you were looking at."
      />
      <FeedbackPageOpen />
    </>
  );
}
