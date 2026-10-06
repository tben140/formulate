import { logoutUrl } from "@formulate/shopify";
import { NextResponse, type NextRequest } from "next/server";

import { clearCartId } from "@/lib/cart";
import {
  clearCustomerTokens,
  customerAccountConfig,
  readCustomerTokens,
  requestOrigin,
} from "@/lib/customer-account";

/**
 * Signs the buyer out, here and at Shopify.
 *
 * POST, from a form button, so a link or an image on another site can't sign
 * someone out. The Origin check is the same idea for browsers that would send
 * a cross-site form POST anyway.
 */
const signOut = async (request: NextRequest) => {
  const origin = requestOrigin(request.headers, request.nextUrl.origin);
  const sentBy = request.headers.get("origin");
  if (sentBy && sentBy !== origin) {
    return new NextResponse(null, { status: 403 });
  }

  const tokens = await readCustomerTokens();
  await clearCustomerTokens();

  /*
   * ⚠️ The cart goes too. It was attached to this buyer at sign-in, so on a
   * shared computer the next person's checkout would open signed in as them,
   * with their saved addresses. Starting a fresh cart is the only way to be
   * sure it doesn't.
   */
  await clearCartId();

  // 303, so the browser follows with a GET rather than re-posting to Shopify.
  const destination = tokens
    ? logoutUrl(customerAccountConfig, {
        idToken: tokens.idToken,
        postLogoutRedirectUri: new URL("/", origin).toString(),
      })
    : new URL("/", origin).toString();
  return NextResponse.redirect(destination, 303);
};

export { signOut as POST };
