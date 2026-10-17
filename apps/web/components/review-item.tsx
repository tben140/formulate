import {
  formatReviewDate,
  singleRatingLabel,
  type PublicReview,
} from "@formulate/shopify";

import { Stars } from "./stars";

/**
 * One review. A sample review (written for this demo store) always says so,
 * prominently: presenting invented reviews as genuine is unlawful in the UK
 * (DMCC Act 2024), and a portfolio piece should model that.
 */
export const ReviewItem = ({ review }: { readonly review: PublicReview }) => (
  <li className="py-5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Stars value={review.rating} label={singleRatingLabel(review.rating)} size={14} />
      {review.title ? <h3 className="font-semibold">{review.title}</h3> : null}
    </div>
    {review.sample ? (
      <p className="mt-2 inline-block rounded border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground">
        Sample review, written for this demo store
      </p>
    ) : null}
    {review.body ? <p className="mt-2 whitespace-pre-line">{review.body}</p> : null}
    {review.pictures.length > 0 ? (
      <ul className="mt-3 flex gap-2">
        {review.pictures.slice(0, 4).map((url, index) => (
          <li key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Judge.me's CDN, not Shopify's: next/image isn't configured for it */}
            <img
              src={url}
              alt={`From ${review.author}'s review, ${index + 1} of ${review.pictures.slice(0, 4).length}`}
              width={72}
              height={72}
              loading="lazy"
              className="h-18 w-18 rounded object-cover"
            />
          </li>
        ))}
      </ul>
    ) : null}
    <p className="mt-2 text-sm text-foreground-muted">
      {review.author}
      {review.verifiedBuyer ? " · Verified buyer" : ""}
      {review.createdAt ? ` · ${formatReviewDate(review.createdAt)}` : ""}
    </p>
  </li>
);
