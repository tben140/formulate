"use server";

import { CART_ATTRIBUTE_KEYS, cartAttributes } from "@formulate/analytics";
import {
  describeError,
  describeForShopper,
  type Cart,
  type CartLineInput,
} from "@formulate/shopify";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import {
  cartClient,
  clearCartId,
  readBuyerEmail,
  readCartId,
  writeBuyerEmail,
  writeCartId,
} from "@/lib/cart";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Cart mutations, as Server Actions.
 *
 * Every one of these runs on the server, which is what lets the cart id stay in
 * an httpOnly cookie — a client-side cart would have to hand the id to the
 * browser, and that id carries a secret (see lib/cart.ts).
 *
 * They all `revalidatePath("/", "layout")` because the cart is rendered in the
 * root layout, so the drawer and the header count update everywhere at once
 * without either of them fetching anything.
 */

/**
 * ⚠️ A `"use server"` module may export **async functions and nothing else**.
 *
 * A `const` here — even something as innocuous as an initial-state object —
 * fails at runtime with:
 *
 *     A "use server" file can only export async functions, found object.
 *
 * Nothing catches it first: `tsc`, ESLint and `next build` all pass, and the
 * error only appears when a request actually reaches the module. Types are the
 * exception, since they are erased before this rule is applied — so the
 * interface below is fine and the idle value lives with its consumer.
 */
export interface CartActionState {
  readonly status: "idle" | "success" | "error";
  /**
   * Shown to the shopper: an error on failure, or on success a note that fewer
   * were added than asked for (see `notice` in packages/shopify). Always
   * shopper-facing text — never `describeError`, which is for logs.
   */
  readonly message?: string;
  /**
   * Bumped on every successful add.
   *
   * The drawer opens in response to this changing rather than to
   * `status === "success"`, because adding the same product twice leaves the
   * status identical and the second add would not reopen a drawer the shopper
   * had closed.
   */
  readonly token?: number;
  /**
   * The cart as it stands after a successful add.
   *
   * Returned so the client can build the Klaviyo `Added to Cart` payload
   * without a second request. It has to be built client-side regardless —
   * Klaviyo onsite is a browser API and this action runs on the server — so
   * handing back the data is cheaper than making the client refetch it.
   */
  readonly cart?: Cart;
  /** Line key of the item just added, so the event can name it. */
  readonly addedLineId?: string;
  /**
   * How many this add put in, for analytics (not the line's new total). 0 when
   * stock cut the add short: Shopify doesn't say how many went in, possibly
   * none, so the add isn't reported rather than over-counted.
   */
  readonly addedQuantity?: number;
}

/** PostHog's anonymous ids are v4 UUIDs; anything else is ignored. */
const ANALYTICS_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Attributes for a new cart: the visitor's PostHog id and "web", so the
 * custom pixel can credit the order (packages/analytics, `cartAttributes`).
 * Only with tracking consent, checked here on the cookie rather than trusted
 * from the form, and only for an id that looks like one of ours.
 */
const newCartAttributes = async (formData: FormData) => {
  const id = String(formData.get("analyticsId") ?? "");
  if (!ANALYTICS_ID.test(id)) return undefined;
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  return consent === "granted" ? cartAttributes(id, "web") : undefined;
};

const revalidate = () => revalidatePath("/", "layout");

/**
 * Adds a line, creating the cart on first use.
 *
 * Takes FormData rather than typed arguments so the form works through
 * `useActionState`, and — more usefully — so the markup degrades: a plain
 * submit still posts the right fields.
 */
export const addToCart = async (
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> => {
  const merchandiseId = String(formData.get("merchandiseId") ?? "");
  const sellingPlanId = String(formData.get("sellingPlanId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);

  if (!merchandiseId) {
    return { status: "error", message: "Choose an option before adding to the cart." };
  }

  const line: CartLineInput = {
    merchandiseId,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    // Empty string means one-time purchase. Passing "" through would be read as
    // a selling plan id and rejected.
    ...(sellingPlanId ? { sellingPlanId } : {}),
  };

  /*
   * A cart created for a shopper we already know carries their email from the
   * start. That is what lets Shopify record an *attributable* abandoned
   * checkout if they leave without buying — see `create` in packages/shopify.
   *
   * ⚠️ Only a cart Shopify says no longer exists is replaced, and it is
   * replaced within this same add. Any other failure keeps the cookie: the
   * cart is still fine, and clearing it would silently lose everything in it.
   * See `addLinesOrCreate` and `isCartGone` in packages/shopify (SHO-122).
   */
  const attributes = await newCartAttributes(formData);
  const { result, storedCartGone, notice, attributesFailed } =
    await cartClient.addLinesOrCreate({
      cartId: await readCartId(),
      lines: [line],
      email: readBuyerEmail,
      ...(attributes
        ? { attributes }
        : // No consent now: an id added under earlier consent comes off.
          { removeAttributes: CART_ATTRIBUTE_KEYS }),
    });

  if (!result.ok) {
    if (storedCartGone) await clearCartId();
    // The detail for whoever reads the logs; the shopper gets something
    // they can act on, not "Storefront rejected the operation: …gid://…".
    console.error(`[cart] add failed: ${describeError(result.error)}`);
    return { status: "error", message: describeForShopper(result.error) };
  }

  await writeCartId(result.data.id);
  // The add stood but the analytics id didn't come off: one more try before
  // the shopper can reach checkout from this cart. Logged if that fails too.
  if (attributesFailed && !attributes) {
    const retried = await cartClient.removeAttributes(result.data, CART_ATTRIBUTE_KEYS);
    if (!retried.ok)
      console.error(
        `[cart] analytics attributes not removed: ${describeError(retried.error)}`,
      );
  }
  revalidate();

  // The line Shopify actually created for this merchandise + selling plan
  // combination — not necessarily the last one, since adding to an existing
  // line increments it in place rather than appending.
  const addedLine = result.data.lines.nodes.find(
    (line) =>
      line.merchandise.id === merchandiseId &&
      (line.sellingPlanAllocation?.sellingPlan.id ?? "") === sellingPlanId,
  );

  return {
    status: "success",
    ...(notice ? { message: notice } : {}),
    token: Date.now(),
    cart: result.data,
    addedLineId: addedLine?.id,
    addedQuantity: notice ? 0 : (line.quantity ?? 1),
  };
};

/** What a line update or removal reports back: nothing, or why it failed. */
export interface CartLineResult {
  readonly message?: string;
}

export const updateCartLine = async (formData: FormData): Promise<CartLineResult> => {
  const id = String(formData.get("lineId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const cartId = await readCartId();
  if (!cartId || !id) return { message: "Your cart couldn't be found. Please refresh." };

  // Quantity zero is how Shopify expresses removal on an update, so there is no
  // need for the caller to decide which mutation to use.
  const result = await cartClient.updateLines(cartId, [{ id, quantity }]);
  revalidate();
  if (result.ok) return {};
  // The drawer has already shown the change (SHO-52); this tells it to undo.
  console.error(`[cart] update failed: ${describeError(result.error)}`);
  return { message: describeForShopper(result.error) };
};

export const removeCartLine = async (formData: FormData): Promise<CartLineResult> => {
  const lineId = String(formData.get("lineId") ?? "");
  const cartId = await readCartId();
  if (!cartId || !lineId)
    return { message: "Your cart couldn't be found. Please refresh." };

  const result = await cartClient.removeLines(cartId, [lineId]);
  revalidate();
  if (result.ok) return {};
  console.error(`[cart] remove failed: ${describeError(result.error)}`);
  return { message: describeForShopper(result.error) };
};

/**
 * Takes the analytics attributes off the shopper's cart, on a tracking refusal
 * (components/tracking-consent.tsx), so a cart made under earlier consent
 * doesn't carry `_posthog_id` to the order.
 *
 * Housekeeping, not the consent control: the order webhook never reads the id
 * (ADR 0012), and the checkout pixel uses it only if the shopper allows
 * analytics in checkout. So it's quiet on failure, like `identifyBuyer`: the
 * refusal is already recorded in the cookie, and the next add tries again.
 */
export const forgetCartAnalytics = async (): Promise<void> => {
  const cartId = await readCartId();
  if (!cartId) return;
  const cart = await cartClient.get(cartId);
  if (!cart.ok || !cart.data) return;
  const result = await cartClient.removeAttributes(cart.data, CART_ATTRIBUTE_KEYS);
  if (!result.ok)
    console.error(`[cart] forget analytics failed: ${describeError(result.error)}`);
};

/**
 * Records the buyer's email and attaches it to their cart.
 *
 * Called after a successful newsletter sign-up, which is the moment an
 * anonymous session becomes a known shopper. Two things happen, and both
 * matter:
 *
 * 1. The address is stored, so a cart created **later** starts out attributed.
 * 2. If a cart already exists, it is updated, so a cart created **earlier** is
 *    not left anonymous.
 *
 * Without the second, the common case fails: shoppers usually add to cart
 * before they subscribe.
 *
 * ⚠️ Deliberately silent on failure. This is an enhancement to attribution, not
 * something the shopper asked for — a Storefront hiccup must not turn a
 * successful sign-up into a visible error. The subscription itself is already
 * recorded by the time this runs.
 */
export const identifyBuyer = async (email: string): Promise<void> => {
  const trimmed = email.trim();
  if (!trimmed) return;

  await writeBuyerEmail(trimmed);

  const cartId = await readCartId();
  if (!cartId) return;

  await cartClient.setBuyerIdentity(cartId, { email: trimmed });
  revalidate();
};
