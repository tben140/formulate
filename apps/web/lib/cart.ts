import {
  createCartClient,
  isCartId,
  type Cart,
  type StorefrontResult,
} from "@formulate/shopify";
import { cookies } from "next/headers";

import { CONSENT_COOKIE, parseConsent } from "./consent";
import { readCustomerId, readCustomerTokens } from "./customer-account";

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

/**
 * Every cart request states the shopper's answer from our banner, so the
 * checkout URL carries it too: refused until they accept. Without it Shopify
 * assumes consent from the server's location (see visitorConsentFor).
 */
export const cartClient = createCartClient(storefront, {
  trackingChoice: async () => parseConsent((await cookies()).get(CONSENT_COOKIE)?.value),
});

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
  if (!result.ok || !result.data) return null;
  return (await isAnotherBuyersCart(result.data)) ? null : result.data;
};

/**
 * ⚠️ A cart attached to a customer is someone else's unless this browser is
 * signed in as that same customer. Its checkout would open signed in as them,
 * with their saved details, so it's shown as no cart, and the next add starts
 * a fresh one (`cartIdForAdd`). Two ways it happens:
 * - no session: an add to cart that finished after its shopper signed out
 *   wrote the cart id back;
 * - another session: a previous shopper's cart cookie outlived their session,
 *   and attaching it at the next sign-in failed.
 * A session whose customer id isn't known yet (lib/customer-account.ts
 * `rememberCustomerId`) can't prove it owns the cart, so it doesn't.
 */
const isAnotherBuyersCart = async (cart: Cart): Promise<boolean> => {
  const owner = cart.buyerIdentity.customer?.id;
  if (!owner) return false;
  if (!(await readCustomerTokens())) return true;
  return owner !== (await readCustomerId());
};

/**
 * The stored cart id for an add to cart, or null to start a new cart when
 * the stored one is another buyer's. Asks Shopify whenever there's a cart,
 * signed in or not: a session doesn't make the cart its own. If that fails,
 * the add stops there: the cookie keeps the cart (SHO-122: never lose a cart
 * on a blip), and nothing is added to a cart whose owner wasn't checked. A
 * retry checks again.
 */
export const cartIdForAdd = async (): Promise<StorefrontResult<string | null>> => {
  const id = await readCartId();
  if (!id) return { ok: true, data: id };
  const result = await cartClient.get(id);
  if (!result.ok) return result;
  return {
    ok: true,
    data: result.data && (await isAnotherBuyersCart(result.data)) ? null : id,
  };
};

const BUYER_EMAIL_COOKIE = "formulate_buyer_email";

/**
 * The buyer's email, once they have given us one.
 *
 * ⚠️ Exists because the email is known **client-side** (the capture form runs
 * in the browser) while the cart is created **server-side**. Without somewhere
 * to put it, the two never meet, and every cart is created anonymous even for a
 * shopper who signed up thirty seconds earlier.
 *
 * httpOnly like the cart id, and for a weaker but real version of the same
 * reason: it is the shopper's personal data, and nothing in the browser needs
 * to read it back. Same ten-day lifetime, so a stale email and a dead cart
 * expire together.
 */
export const readBuyerEmail = async (): Promise<string | null> =>
  (await cookies()).get(BUYER_EMAIL_COOKIE)?.value ?? null;

/** On sign-out, so the next shopper's cart isn't created with this email. */
export const clearBuyerEmail = async (): Promise<void> => {
  (await cookies()).delete(BUYER_EMAIL_COOKIE);
};

/** Only callable from a Server Action or Route Handler. */
export const writeBuyerEmail = async (email: string): Promise<void> => {
  (await cookies()).set(BUYER_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  });
};
