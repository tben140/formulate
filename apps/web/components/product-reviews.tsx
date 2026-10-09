import { ratingLabel, type ReviewSummary } from "@formulate/shopify";

import { fetchReviews } from "@/lib/reviews";
import { absoluteUrl } from "@/lib/site";

import { JsonLd } from "./json-ld";

import { MoreReviews } from "./more-reviews";
import { ReviewItem } from "./review-item";
import { Stars } from "./stars";

/**
 * The product's reviews (Judge.me via the Worker), below the product.
 *
 * An async Server Component behind <Suspense>, like PairsWellWith: the
 * reviews stream in after the product and never hold up the page. Rendered on
 * the server, so no third-party script reaches the browser.
 *
 * Without reviews it says so and stops; if they can't be loaded it renders
 * nothing, because a missing reviews list is not a reason for the page to error.
 */
export const ProductReviews = async ({
  handle,
  summary,
}: {
  readonly handle: string;
  readonly summary: ReviewSummary | null;
}) => {
  const first = await fetchReviews(handle);
  if (!first) return null;

  /*
   * Google shows stars in search results from AggregateRating, and requires
   * it to reflect genuine reviews. So it's emitted only when none of the
   * reviews shown are samples: invented reviews must never reach search.
   */
  const genuine =
    first.reviews.length > 0 && first.reviews.every((review) => !review.sample);

  return (
    <section
      id="reviews"
      aria-labelledby="reviews-heading"
      className="mt-12 border-t border-border pt-8"
    >
      {summary && genuine ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            "@id": `${absoluteUrl(`/products/${handle}`)}#product`,
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: summary.average,
              reviewCount: summary.count,
              bestRating: 5,
              worstRating: 1,
            },
          }}
        />
      ) : null}
      <h2 id="reviews-heading" className="text-xl font-semibold">
        Reviews
      </h2>
      {summary ? (
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Stars value={summary.average} label={ratingLabel(summary)} />
          <span aria-hidden="true">
            {summary.average} · {summary.count}{" "}
            {summary.count === 1 ? "review" : "reviews"}
          </span>
        </p>
      ) : null}

      {first.reviews.length === 0 ? (
        <p className="mt-3 text-foreground-muted">No reviews yet.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {first.reviews.map((review) => (
              <ReviewItem key={review.id} review={review} />
            ))}
          </ul>
          {first.hasMore ? <MoreReviews handle={handle} /> : null}
        </>
      )}
    </section>
  );
};
