export function ReviewsPreview({ companyName }: { companyName: string }) {
  return (
    <div className="reviews-preview" aria-hidden="true">
      <article className="reviews-preview__survey">
        <p className="reviews-preview__kicker">{companyName} would like your feedback</p>
        <p className="reviews-preview__question">
          Overall, how satisfied were you with {companyName}?
        </p>
        <div className="reviews-preview__scale">
          <span>Not at all likely</span>
          <span>Extremely likely</span>
        </div>
        <p className="reviews-preview__stars">★★★☆☆</p>
        <p className="reviews-preview__question">What can {companyName} do better next time?</p>
        <div className="reviews-preview__box" />
        <p className="reviews-preview__foot">We&apos;ll share your rating with {companyName}.</p>
      </article>
      <article className="reviews-preview__list">
        <p className="reviews-preview__list-kicker">Reviews &amp; testimonials</p>
        <p>Reviews, feedback and testimonials from your customers.</p>
        <div className="reviews-preview__item">
          <span>Customer</span>
          <span>via Invoice</span>
          <span className="reviews-preview__stars">★★★★★</span>
        </div>
        <div className="reviews-preview__item">
          <span>Customer</span>
          <span>via Invoice</span>
          <span className="reviews-preview__stars">★★★★☆</span>
        </div>
      </article>
    </div>
  );
}
