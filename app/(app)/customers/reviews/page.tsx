import Link from 'next/link';
import { Permission } from '@/server/auth/permissions';
import { can, requireSession, resolveEntity } from '@/server/auth/session';
import { listCustomerReviews } from '@/server/modules/sales/hub';
import { getSalesSurveySettings } from '@/server/modules/settings/survey';
import { Alert, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { SURVEY_SETTINGS_HREF, reviewStars } from '@/lib/customer-hub';
import { formatDisplayDate } from '@/lib/payables';
import { ReviewsPreview } from '../reviews-preview';

export const metadata = { title: 'Reviews · SkyJet' };

export default async function ReviewsPage() {
  const session = await requireSession();
  const entity = await resolveEntity(session);
  const context = {
    userId: session.userId,
    entityId: entity.entityId,
    requestId: session.requestId,
  };
  const settings = await getSalesSurveySettings(context);
  const maySettings = can(session, entity.entityId, Permission.SettingsManage);

  if (!settings.askReview) {
    return (
      <>
        <PageHeader title="Reviews" />
        <Alert tone="info">
          &lsquo;Reviews&rsquo; question is off and is no longer collecting reviews. To collect
          responses, enable the &lsquo;Reviews&rsquo; question in{' '}
          {maySettings ? (
            <Link href={SURVEY_SETTINGS_HREF}>survey settings</Link>
          ) : (
            'survey settings'
          )}
          .
        </Alert>
        <div className="reviews-promo">
          <div className="reviews-promo__copy">
            <h2>Elevate your reputation with reviews</h2>
            <p>
              Build stronger customer relationships by allowing your customers to rate their
              satisfaction with your service on a scale of 1 to 5 stars and leave feedback or a
              testimonial.
            </p>
            {maySettings ? (
              <Link href={SURVEY_SETTINGS_HREF} className="button button--primary">
                Enable Reviews question
              </Link>
            ) : (
              <p>
                Someone who can manage account settings needs to turn the Reviews question on under
                Post-invoice/Feedback survey.
              </p>
            )}
          </div>
          <ReviewsPreview companyName={entity.name} />
        </div>
      </>
    );
  }

  const rows = await listCustomerReviews(context);

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Reviews, feedback and testimonials from your customers."
        actions={
          maySettings ? (
            <Link href={SURVEY_SETTINGS_HREF} className="button">
              Manage survey settings
            </Link>
          ) : null
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            description="The Reviews question is on. Ratings will appear here when customers respond after an invoice."
          />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Source</th>
                <th>Date</th>
                <th>Rating</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.customer_name}</td>
                  <td>{row.invoice_no ? `via Invoice ${row.invoice_no}` : '—'}</td>
                  <td>{formatDisplayDate(row.submitted_on)}</td>
                  <td>
                    <span className="reviews-stars" aria-label={`${row.rating} out of 5 stars`}>
                      {reviewStars(row.rating)}
                    </span>
                  </td>
                  <td className="cell-wrap">{row.comment ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
    </>
  );
}
