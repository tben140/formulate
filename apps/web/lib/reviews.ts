import type { PublicReview } from "@formulate/shopify";

/**
 * Product reviews from the Worker (apps/api, POST /reviews), server-side only:
 * the Worker sends no CORS headers, and the browser never needs to call it.
 * Cached for ten minutes like the Worker's own answer.
 */
const API_URL = process.env.FORMULATE_API_URL ?? "";

export interface ReviewsPage {
  readonly reviews: readonly PublicReview[];
  readonly page: number;
  readonly hasMore: boolean;
}

/** A page of reviews, or null when they can't be loaded (the section hides). */
export const fetchReviews = async (
  handle: string,
  page = 1,
): Promise<ReviewsPage | null> => {
  if (!API_URL) return null;
  try {
    const response = await fetch(`${API_URL}/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle, page }),
      next: { revalidate: 600 },
    });
    const body = (await response.json()) as
      ({ ok: true } & ReviewsPage) | { ok: false; reason: string };
    return body.ok
      ? { reviews: body.reviews, page: body.page, hasMore: body.hasMore }
      : null;
  } catch {
    return null;
  }
};
