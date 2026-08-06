import { createCartClient, isCartId, type Cart } from "@formulate/shopify";
import { cookies } from "next/headers";

import { storefront } from "./storefront";

/**
 * Server-side cart access for the web app.
 *
 * The cart id lives in an **httpOnly** cookie, so it is never readable by
 * client JavaScript. That matters more than it looks: the id carries a `?key=`
 * secret that gates the buyer's own email address on the cart (see `isCartId`).
 * Treating it as a bearer token rather than a public identifier is the whole
 * reason this file is server-only.
 *
 * `apps/mobile` reaches the same conclusion by a different route and uses the
 * OS keychain. Neither shares an abstraction with the other — see
 * docs/adr/0005-parity-means-design-not-data.md.
 */

export const cartClient = createCartClient(storefront);

const CART_COOKIE = "formulate_cart";

/**
 * Shopify carts expire after roughly ten days of inactivity. Matching that
 * means a stale cookie and a dead cart tend to disappear together, rather than
 * the cookie outliving the cart and producing a silent empty state.
 */
const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 10;

/**
 * Reads the stored cart id, rejecting anything malformed.
 *
 * The `isCartId` guard is not defensive programming for its own sake. A cart id
 * that has lost its `?key=` still resolves — same lines, same totals, no error —
 * but silently returns null for the buyer's email. Cookies outlive deploys, so
 * one bad value written once would keep coming back long after the bug was
 * fixed. Better to treat it as no cart and start a fresh one.
 */
export const readCartId = async (): Promise<string | null> => {
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return value && isCartId(value) ? value : null;
};

/** Only callable from a Server Action or Route Handler. */
export const writeCartId = async (id: string): Promise<void> => {
  (await cookies()).set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
};

export const clearCartId = async (): Promise<void> => {
  (await cookies()).delete(CART_COOKIE);
};

/**
 * The current cart, or null when there isn't one.
 *
 * Deliberately collapses every failure to null. This is called from the root
 * layout on every request, and a Storefront hiccup should not take the whole
 * site down — an empty cart badge is a far better outcome than an error page on
 * a product listing. Mutations go through Server Actions, which surface their
 * errors properly.
 *
 * A completed cart also resolves to null: Shopify stops returning it once the
 * order is placed, which is exactly how the cart empties itself after checkout
 * without the web app needing a completion callback it never receives.
 */
export const getCart = async (): Promise<Cart | null> => {
  const id = await readCartId();
  if (!id) return null;

  const result = await cartClient.get(id);
  return result.ok ? result.data : null;
};
