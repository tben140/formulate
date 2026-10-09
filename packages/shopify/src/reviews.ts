/**
 * Product reviews (Judge.me), the parts every surface shares.
 *
 * Two sources, on purpose:
 *
 * - **The summary** (average and count) comes from Shopify's standard review
 *   metafields, `reviews.rating` and `reviews.rating_count`, which Judge.me
 *   keeps in sync. They arrive with the product queries we already make, so
 *   stars on a product card cost nothing extra, and the Liquid theme reads
 *   the very same fields.
 * - **The reviews themselves** come from Judge.me through the Worker
 *   (apps/api, POST /reviews), which holds the private token and copies out
 *   only what a page may show. `PublicReview` is that shape.
 */

export interface ReviewSummary {
  /** 1–5, to one decimal place. */
  readonly average: number;
  readonly count: number;
}

interface MetafieldLike {
  readonly value: string;
}

const parseRating = (value: string): { value?: string; scale_max?: string } | null => {
  try {
    return JSON.parse(value) as { value?: string; scale_max?: string };
  } catch {
    return null;
  }
};

/**
 * The summary from the standard metafields, or null when there are no reviews
 * (or the fields aren't set yet). `reviews.rating` is a JSON rating object:
 * {"value":"4.5","scale_min":"1.0","scale_max":"5.0"}.
 */
export const reviewSummary = (product: {
  readonly rating?: MetafieldLike | null;
  readonly ratingCount?: MetafieldLike | null;
}): ReviewSummary | null => {
  const count = Number.parseInt(product.ratingCount?.value ?? "", 10);
  if (!Number.isFinite(count) || count <= 0 || !product.rating) return null;
  const parsed = parseRating(product.rating.value);
  const value = Number(parsed?.value);
  const scale = Number(parsed?.scale_max ?? 5) || 5;
  if (!Number.isFinite(value) || value <= 0) return null;
  // Normalised to five stars, whatever scale the app wrote.
  return { average: Math.round((value / scale) * 5 * 10) / 10, count };
};

/** "4.5 out of 5 stars from 12 reviews": the accessible name for a rating. */
export const ratingLabel = (summary: ReviewSummary): string =>
  `${summary.average} out of 5 stars from ${summary.count} ${summary.count === 1 ? "review" : "reviews"}`;

/** "Rated 4 out of 5": one review's accessible name. */
export const singleRatingLabel = (rating: number): string => `Rated ${rating} out of 5`;

/** How full each of five stars is (0–1), for drawing partial stars. */
export const starFills = (average: number): readonly number[] =>
  [0, 1, 2, 3, 4].map((i) => Math.max(0, Math.min(1, average - i)));

/** A review as the Worker returns it: no email, phone or marketing status. */
export interface PublicReview {
  readonly id: number;
  readonly rating: number;
  readonly title: string | null;
  readonly body: string;
  /** "Sam T.": first name and initial, as Judge.me's own widget shows. */
  readonly author: string;
  /** ISO date-time. */
  readonly createdAt: string;
  readonly verifiedBuyer: boolean;
  /** Image URLs, largest first available size. */
  readonly pictures: readonly string[];
  /**
   * A sample review for the demo store. ⚠️ Always shown as such: presenting
   * invented reviews as genuine is unlawful in the UK (DMCC Act 2024).
   */
  readonly sample: boolean;
}

/** "Sam Taylor" → "Sam T."; a single name stays as it is. */
export const reviewerDisplayName = (name: string | null | undefined): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Anonymous";
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last[0]?.toUpperCase()}.` : (first ?? "Anonymous");
};

/** "12 October 2026", in the store's locale. */
export const formatReviewDate = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/London",
      }).format(date);
};
