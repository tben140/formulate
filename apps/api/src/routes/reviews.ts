import { readBounded } from "../body";
import { json, respond } from "../http";
import { REVIEWS_LIMIT } from "../rate-limit-policy";
import type { RateLimiter } from "../rate-limiter";
import { cachedReviews, type ReviewsEnv } from "../reviews";

/**
 * `POST /reviews`: a product's published reviews from Judge.me. Public and
 * read-only; what may be shown is decided in src/reviews.ts.
 */

export interface ReviewsRouteEnv extends ReviewsEnv {
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

/** A handle and a page number; anything longer isn't a lookup. */
const MAX_BODY_BYTES = 1024;

export const handleReviews = async (
  request: Request,
  env: ReviewsRouteEnv,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "rejected" }, 405);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ ok: false, reason: "rejected" }, 415);
  }

  const raw = await readBounded(request, MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, reason: "rejected" }, 413);
  }

  // Limited only when a lookup misses the cache and would reach Judge.me: the
  // web app asks from its server, so all its shoppers share a few addresses.
  // Its own object per IP, so review lookups never use up the sign-up
  // allowance or the other way round.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { status, body } = await cachedReviews(env, raw, async () => {
    const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(`reviews:${ip}`));
    return (await limiter.limit(REVIEWS_LIMIT)).success;
  });
  return respond(body, status);
};
