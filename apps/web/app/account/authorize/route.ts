import {
  describeCustomerAccountError,
  describeError,
  exchangeCode,
} from "@formulate/shopify";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { cartClient, readCartId } from "@/lib/cart";
import {
  callbackPath,
  customerAccountConfig,
  requestOrigin,
  takePendingSignIn,
  writeCustomerTokens,
} from "@/lib/customer-account";

/**
 * Where Shopify sends the buyer back after signing in.
 *
 * ⚠️ This URL must be registered, exactly, as a callback URL on the Customer
 * Account API client in Shopify admin, for every origin that serves it.
 * Shopify refuses `http://` and `localhost`, so local sign-in needs an HTTPS
 * tunnel. See docs/integration-customer-accounts.md.
 */
const completeSignIn = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;

  // Read (and delete) before anything else, so a failed attempt can't be
  // retried with the same values.
  const pending = await takePendingSignIn();

  // Covers the buyer cancelling at Shopify (`error=access_denied`), a stale or
  // missing pending cookie, and a forged callback whose `state` isn't ours:
  // the CSRF case `state` exists for.
  const code = params.get("code");
  if (params.get("error") || !pending || !code || params.get("state") !== pending.state) {
    redirect("/account?error=sign-in");
  }

  const origin = requestOrigin(request.headers, request.nextUrl.origin);
  const result = await exchangeCode(customerAccountConfig, {
    code,
    codeVerifier: pending.codeVerifier,
    redirectUri: new URL(callbackPath, origin).toString(),
    nonce: pending.nonce,
    origin,
  });
  if (!result.ok) {
    console.error(describeCustomerAccountError(result.error));
    redirect("/account?error=sign-in");
  }

  await writeCustomerTokens(result.data);

  /*
   * Attach the cart built while signed out to the buyer.
   *
   * The Customer Account access token goes straight into the cart's buyer
   * identity: since 2025-01 the Storefront API accepts it, and the old
   * exchange for a separate Storefront token is deprecated. Checkout then
   * opens signed in, with the buyer's saved addresses.
   *
   * A failure here is logged, not shown: the buyer is signed in either way,
   * and checkout will still ask who they are.
   */
  const cartId = await readCartId();
  if (cartId) {
    const attached = await cartClient.setBuyerIdentity(cartId, {
      customerAccessToken: result.data.accessToken,
    });
    if (!attached.ok) console.error(describeError(attached.error));
  }

  redirect(pending.returnTo);
};

export { completeSignIn as GET };
