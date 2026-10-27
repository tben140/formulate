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
    // Usually an expired or revoked refresh token: the session is over, so
    // drop it and ask the buyer to sign in again rather than looping here.
    console.error(describeCustomerAccountError(result.error));
    await clearCustomerTokens();
    redirect(signIn);
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
