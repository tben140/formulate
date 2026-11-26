import {
  createAuthorizationRequest,
  describeCustomerAccountError,
} from "@formulate/shopify";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  callbackPath,
  customerAccountConfig,
  isCustomerAccountConfigured,
  requestOrigin,
  safeReturnTo,
  webAuthCrypto,
  writePendingSignIn,
} from "@/lib/customer-account";

/**
 * Starts a sign-in: remembers what the callback will need, then hands the
 * buyer to Shopify's hosted sign-in page (email and a one-time code; there is
 * no password to collect here, which is the point of the new accounts).
 *
 * A Route Handler, not a page, because it sets a cookie and redirects. Nothing
 * here renders.
 */
const startSignIn = async (request: NextRequest) => {
  // /account explains an unconfigured deployment instead of redirecting back
  // here, so this can't loop.
  if (!isCustomerAccountConfigured) redirect("/account");

  // The callback must be on the same origin as this request: the pending
  // cookie was set here, and a preview deployment has its own address.
  const redirectUri = new URL(
    callbackPath,
    requestOrigin(request.headers, request.nextUrl.origin),
  ).toString();

  const result = await createAuthorizationRequest(
    customerAccountConfig,
    { redirectUri, locale: "en" },
    webAuthCrypto,
  );
  if (!result.ok) {
    console.error(describeCustomerAccountError(result.error));
    redirect("/account?error=sign-in");
  }

  const { url, state, nonce, codeVerifier } = result.data;
  await writePendingSignIn({
    state,
    nonce,
    codeVerifier,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get("return_to")),
  });

  redirect(url);
};

export { startSignIn as GET };
