/**
 * Writing a review: web's "Write a review" form, sent on to Judge.me.
 *
 *   POST /reviews/new  Authorization: <Customer Account access token>
 *                      { "productId": "gid://shopify/Product/1", "rating": 5,
 *                        "name": "Sam Taylor", "title": "Easy to take",
 *                        "body": "…" }
 *
 * Through the Worker for the same reason as reading them (src/reviews.ts): the
 * private token stays here. Judge.me holds new reviews for its moderation
 * rules before publishing, and shows the reviewer's name shortened ("Sam T.")
 * when we read them back.
 *
 * ⚠️ Exactly these fields are read and forwarded, each checked; nothing else
 * from the caller reaches Judge.me. The email isn't one of them: it's the
 * signed-in customer's, from Shopify (src/review-customer.ts). It's personal
 * data, sent to Judge.me (which verifies the reviewer by it) and never logged.
 */
import type { ReviewsEnv } from "./reviews";

const JUDGEME_API = "https://judge.me/api/v1";

/** Body size for this route; reading reviews keeps the Worker's 1 KB. */
export const SUBMIT_MAX_BODY_BYTES = 6 * 1024;

export const LIMITS = { name: 80, title: 120, body: 2000 } as const;

const PRODUCT_ID = /^(?:gid:\/\/shopify\/Product\/)?(\d{1,20})$/;

export type SubmitResult =
  | { readonly status: 202; readonly body: { readonly ok: true } }
  | {
      readonly status: number;
      readonly body: {
        readonly ok: false;
        readonly reason:
          | "invalid"
          | "not-configured"
          | "unavailable"
          | "signed-out"
          | "not-purchased"
          | "no-email"
          | "rate-limited";
        /** For "invalid": which field, so the form can say. */
        readonly field?: string;
      };
    };

const invalid = (field: string): SubmitResult => ({
  status: 400,
  body: { ok: false, reason: "invalid", field },
});

const text = (value: unknown, max: number, required: boolean): string | null => {
  if (value === undefined || value === null || value === "") return required ? null : "";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if ((required && trimmed.length === 0) || trimmed.length > max) return null;
  return trimmed;
};

/** A review as checked here, ready for Judge.me once the reviewer is known. */
export interface CheckedReview {
  /** The numeric product id. */
  readonly productId: string;
  readonly rating: number;
  readonly name: string;
  readonly title: string;
  readonly body: string;
}

/** The caller's fields, each checked; anything else in the body is ignored. */
export const parseReview = (
  raw: string,
):
  | { readonly ok: true; readonly review: CheckedReview }
  | { readonly ok: false; readonly result: SubmitResult } => {
  const fail = (field: string) => ({ ok: false as const, result: invalid(field) });

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fail("body");
    input = parsed as Record<string, unknown>;
  } catch {
    return fail("body");
  }

  const productId =
    typeof input.productId === "string"
      ? PRODUCT_ID.exec(input.productId)?.[1]
      : undefined;
  if (!productId) return fail("productId");
  const rating = input.rating;
  if (
    typeof rating !== "number" ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5
  ) {
    return fail("rating");
  }
  const name = text(input.name, LIMITS.name, true);
  if (name === null) return fail("name");
  const title = text(input.title, LIMITS.title, false);
  if (title === null) return fail("title");
  const body = text(input.body, LIMITS.body, true);
  if (body === null) return fail("body");

  return { ok: true, review: { productId, rating, name, title, body } };
};

export const isConfigured = (env: ReviewsEnv): boolean =>
  Boolean(env.JUDGEME_PRIVATE_TOKEN && env.SHOPIFY_STORE_DOMAIN);

/** Sends a checked review to Judge.me, under the signed-in customer's email. */
export const sendReview = async (
  env: ReviewsEnv,
  review: CheckedReview,
  email: string,
): Promise<SubmitResult> => {
  if (!env.JUDGEME_PRIVATE_TOKEN || !env.SHOPIFY_STORE_DOMAIN) {
    return { status: 503, body: { ok: false, reason: "not-configured" } };
  }

  const url = new URL(`${env.JUDGEME_API_URL ?? JUDGEME_API}/reviews`);
  url.search = new URLSearchParams({
    shop_domain: env.SHOPIFY_STORE_DOMAIN,
    api_token: env.JUDGEME_PRIVATE_TOKEN,
  }).toString();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        shop_domain: env.SHOPIFY_STORE_DOMAIN,
        platform: "shopify",
        id: Number(review.productId),
        name: review.name,
        email,
        rating: review.rating,
        ...(review.title ? { title: review.title } : {}),
        body: review.body,
        reviewer_name_format: "last_initial",
      }),
    });
    if (!response.ok) {
      // The status only: the request carried the reviewer's email.
      console.error("judge.me review submit failed", { status: response.status });
      return { status: 502, body: { ok: false, reason: "unavailable" } };
    }
    return { status: 202, body: { ok: true } };
  } catch {
    return { status: 502, body: { ok: false, reason: "unavailable" } };
  }
};
