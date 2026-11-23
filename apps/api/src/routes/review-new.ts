import { readBounded } from "../body";
import { json, respond } from "../http";
import type { RateLimiter } from "../rate-limiter";
import { checkReviewer, customerToken, type ReviewerEnv } from "../review-customer";
import {
  isConfigured,
  parseReview,
  sendReview,
  SUBMIT_MAX_BODY_BYTES,
  type SubmitResult,
} from "../review-submit";
import type { ReviewsEnv } from "../reviews";

/**
 * `POST /reviews/new`: a review written in web's form, sent on to Judge.me.
 * Only from a signed-in customer who bought the product
 * (src/review-customer.ts); what's accepted and forwarded is decided in
 * src/review-submit.ts.
 */

export interface ReviewNewEnv extends ReviewsEnv, ReviewerEnv {
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

const refuse = (
  reason: Exclude<SubmitResult["body"], { ok: true }>["reason"],
  status: number,
) => respond({ ok: false, reason }, status);

export const handleReviewNew = async (
  request: Request,
  env: ReviewNewEnv,
): Promise<Response> => {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "rejected" }, 405);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ ok: false, reason: "rejected" }, 415);
  }
  if (!isConfigured(env) || !env.SHOPIFY_SHOP_ID || !env.SHOPIFY_API_VERSION) {
    return refuse("not-configured", 503);
  }

  const token = customerToken(request);
  if (!token) return refuse("signed-out", 401);

  // A written review is longer than anything else this Worker takes.
  const raw = await readBounded(request, SUBMIT_MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, reason: "rejected" }, 413);
  }
  const parsed = parseReview(raw);
  if (!parsed.ok) return respond(parsed.result.body, parsed.result.status);

  const reviewer = await checkReviewer(env, token, parsed.review.productId);
  switch (reviewer.kind) {
    case "signed-out":
      return refuse("signed-out", 401);
    case "not-purchased":
      return refuse("not-purchased", 403);
    case "no-email":
      return refuse("no-email", 422);
    case "unavailable":
      return refuse("unavailable", 502);
    case "ok":
      break;
  }

  // Per customer, not per address: the form posts from web's server, so
  // every shopper would otherwise share one bucket. Shopify named the
  // customer, so a caller can't pick a fresh bucket for each try.
  const { success } = await env.RATE_LIMITER.get(
    env.RATE_LIMITER.idFromName(`review-writer:${reviewer.customerId}`),
  ).limit();
  if (!success) return refuse("rate-limited", 429);

  const { status, body } = await sendReview(env, parsed.review, reviewer.email);
  return respond(body, status);
};
