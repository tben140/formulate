import type { PublicReview } from "@formulate/shopify";
import { useInfiniteQuery } from "@tanstack/react-query";

/**
 * Product reviews from the Worker (apps/api, POST /reviews), as on web. The
 * Worker holds Judge.me's private token; the app never sees it.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

interface ReviewsPage {
  readonly reviews: readonly PublicReview[];
  readonly page: number;
  readonly hasMore: boolean;
}

const fetchReviews = async (handle: string, page: number): Promise<ReviewsPage> => {
  const response = await fetch(`${API_BASE_URL}/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle, page }),
  });
  const body = (await response.json().catch(() => null)) as
    ({ ok: true } & ReviewsPage) | { ok: false } | null;
  if (!body?.ok) throw new Error("Reviews couldn't be loaded.");
  return body;
};

/** A product's reviews, ten at a time. Off without the Worker's URL. */
export const useReviews = (handle: string) =>
  useInfiniteQuery({
    queryKey: ["reviews", handle],
    queryFn: ({ pageParam }) => fetchReviews(handle, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: Boolean(API_BASE_URL && handle),
    staleTime: 10 * 60_000,
  });
