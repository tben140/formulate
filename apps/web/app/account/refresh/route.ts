import {
  describeCustomerAccountError,
  describeError,
  refreshTokens,
} from "@formulate/shopify";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { cartClient, readCartId } from "@/lib/cart";
import {
  clearCustomerTokens,
  customerAccountConfig,
  markRefreshedAfter401,
  readCustomerTokens,
  requestOrigin,
  safeReturnTo,
  wasRefreshedAfter401,
  writeCustomerTokens,
} from "@/lib/customer-account";

/**
 * Renews an expired access token, then goes back where the buyer was.
 *
 * Its own route because a Server Component can read cookies but not set them:
 * the account page notices the token has expired and sends the buyer through
 * here, which costs one redirect roughly every hour of an open session.
 */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const refresh = async (request: NextRequest) => {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("return_to"));
  const signIn = `/account/login?return_to=${encodeURIComponent(returnTo)}`;

  const tokens = await readCustomerTokens();
  if (!tokens) redirect(signIn);

  // A second 401 straight after a refresh: Shopify has ended the session, and
  // refreshing again would loop. Sign out and ask the buyer to sign in.
  const after401 = request.nextUrl.searchParams.get("after") === "401";
  if (after401 && (await wasRefreshedAfter401())) {
    await clearCustomerTokens();
    redirect(signIn);
  }

  const result = await refreshTokens(customerAccountConfig, tokens, {
    origin: requestOrigin(request.headers, request.nextUrl.origin),
  });
  if (!result.ok) {
    console.error(describeCustomerAccountError(result.error));
    // Shopify refused the grant (a 4xx: the refresh token expired or was
    // revoked), so the session is over: drop it and ask for a sign-in.
    if (result.error.kind === "http" && result.error.status < 500) {
      await clearCustomerTokens();
      redirect(signIn);
    }
    // Anything else (offline, a 5xx, a garbled answer) says nothing about the
    // refresh token, which is good for 30 days: keep it, and offer a retry.
    return new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Try again</title><p>We couldn't reach Shopify to keep you signed in. <a href="${escapeHtml(request.nextUrl.pathname + request.nextUrl.search)}">Try again</a></p>`,
      {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8", "retry-after": "5" },
      },
    );
  }

  await writeCustomerTokens(result.data);
  if (after401) await markRefreshedAfter401();

  // Keep the cart's identity on a token that still works.
  const cartId = await readCartId();
  if (cartId) {
    const attached = await cartClient.setBuyerIdentity(cartId, {
      customerAccessToken: result.data.accessToken,
    });
    if (!attached.ok) console.error(describeError(attached.error));
  }

  redirect(returnTo);
};

export { refresh as GET };
