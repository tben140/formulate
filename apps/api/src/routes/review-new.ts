import { readBounded } from "../body";
import { json, respond } from "../http";
import type { RateLimiter } from "../rate-limiter";
import { SUBMIT_MAX_BODY_BYTES, submitReview } from "../review-submit";
import type { ReviewsEnv } from "../reviews";

/**
 * `POST /reviews/new`: a review written in web's form, sent on to Judge.me.
 * What's accepted and forwarded is decided in src/review-submit.ts.
 */

export interface ReviewNewEnv extends ReviewsEnv {
  readonly RATE_LIMITER: DurableObjectNamespace<RateLimiter>;
}

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

  // The same per-IP bucket as the newsletter sign-up, as before the routes
  // were split: both are a person submitting a form.
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip)).limit();
  if (!success) {
    return json({ ok: false, reason: "rate-limited" }, 429);
  }

  // A written review is longer than anything else this Worker takes.
  const raw = await readBounded(request, SUBMIT_MAX_BODY_BYTES);
  if (raw === null) {
    return json({ ok: false, reason: "rejected" }, 413);
  }

  const { status, body } = await submitReview(env, raw);
  return respond(body, status);
};
