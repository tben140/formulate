"use server";

import {
  describeCustomerAccountError,
  isTokenExpiring,
  refreshTokens,
  type CustomerTokens,
} from "@formulate/shopify";
import { headers } from "next/headers";

import {
  clearCustomerTokens,
  customerAccountConfig,
  isCustomerAccountConfigured,
  readCustomerTokens,
  requestOrigin,
  safeReturnTo,
  writeCustomerTokens,
} from "@/lib/customer-account";
import { siteUrl } from "@/lib/site";

/**
 * "Write a review": sent through the Worker (apps/api, POST /reviews/new),
 * which holds Judge.me's private token and checks every field again.
 *
 * Only from a signed-in customer who bought the product: the shopper's
 * Customer Account token goes to the Worker, which asks Shopify who they are
 * and what they've ordered. So no email is asked for here; the review goes to
 * Judge.me under the account's, and shows as from a verified buyer.
 */

/** What was typed, so a failed send doesn't lose it (React resets the form). */
export interface ReviewValues {
  readonly rating: string;
  readonly name: string;
  readonly title: string;
  readonly body: string;
}

export type ReviewFormState =
  | { readonly status: "idle" }
  | { readonly status: "sent" }
  | {
      readonly status: "error";
      readonly message: string;
      readonly values: ReviewValues;
      /** Where to sign in, when that's what's needed. */
      readonly signIn?: string;
    };

/**
 * The shopper's tokens, renewed first if the access token is expiring, as
 * app/account/refresh does: a Server Action can set cookies, so no redirect.
 * "signed-out" only when there's no session or Shopify refuses the renewal.
 */
const sessionTokens = async (): Promise<
  CustomerTokens | "signed-out" | "unavailable"
> => {
  const tokens = await readCustomerTokens();
  if (!tokens) return "signed-out";
  if (!isTokenExpiring(tokens)) return tokens;

  const result = await refreshTokens(customerAccountConfig, tokens, {
    origin: requestOrigin(await headers(), siteUrl.origin),
  });
  if (result.ok) {
    await writeCustomerTokens(result.data);
    return result.data;
  }
  console.error(describeCustomerAccountError(result.error));
  // A 4xx: the refresh token expired or was revoked, so the session is over.
  if (result.error.kind === "http" && result.error.status < 500) {
    await clearCustomerTokens();
    return "signed-out";
  }
  return "unavailable";
};

const FIELD_MESSAGES: Record<string, string> = {
  rating: "Choose a rating from 1 to 5 stars.",
  name: "Add your name (up to 80 characters).",
  title: "Keep the title to 120 characters.",
  body: "Write your review (up to 2,000 characters).",
};

export const submitReview = async (
  _previous: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> => {
  const values: ReviewValues = {
    rating: String(formData.get("rating") ?? ""),
    name: String(formData.get("name") ?? ""),
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  };
  const error = (message: string, signIn?: string): ReviewFormState => ({
    status: "error",
    message,
    values,
    ...(signIn ? { signIn } : {}),
  });
  // Back to this product after signing in.
  const signIn = `/account/login?return_to=${encodeURIComponent(
    safeReturnTo(String(formData.get("returnTo") ?? "")),
  )}`;

  const api = process.env.FORMULATE_API_URL ?? "";
  if (!api || !isCustomerAccountConfigured) {
    return error("Reviews can't be sent right now.");
  }
  const tokens = await sessionTokens();
  if (tokens === "signed-out") {
    return error(
      "Sign in to send your review. What you've written is kept here.",
      signIn,
    );
  }
  if (tokens === "unavailable") {
    return error("Your review couldn't be sent. Try again later.");
  }

  try {
    const response = await fetch(`${api}/reviews/new`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The Customer Account API takes the bare token.
        Authorization: tokens.accessToken,
      },
      body: JSON.stringify({
        productId: String(formData.get("productId") ?? ""),
        rating: Number(values.rating || 0),
        name: values.name,
        title: values.title,
        body: values.body,
      }),
    });
    // The Worker caps the body in bytes, so a review within the form's
    // character limits can still be too big (CJK text is 3 bytes a character).
    // Sending it again won't help; shortening it will.
    if (response.status === 413) {
      return error("Your review is too long to send. Shorten it and try again.");
    }
    const result = (await response.json()) as
      { ok: true } | { ok: false; reason: string; field?: string };
    if (result.ok) return { status: "sent" };
    if (result.reason === "invalid" && result.field && FIELD_MESSAGES[result.field]) {
      return error(FIELD_MESSAGES[result.field]!);
    }
    if (result.reason === "signed-out") {
      return error("Sign in again to send your review.", signIn);
    }
    if (result.reason === "not-purchased") {
      return error(
        "Reviews here are from verified buyers, and this product isn't in your orders.",
      );
    }
    if (result.reason === "no-email") {
      return error(
        "Your account has no email address, which our reviews provider needs to confirm a review.",
      );
    }
    if (result.reason === "rate-limited") {
      return error("Too many tries. Wait a minute and send it again.");
    }
    return error("Your review couldn't be sent. Try again later.");
  } catch {
    return error("Your review couldn't be sent. Try again later.");
  }
};
