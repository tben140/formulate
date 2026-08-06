"use server";

import { describeError, type CartLineInput } from "@formulate/shopify";
import { revalidatePath } from "next/cache";

import { cartClient, clearCartId, readCartId, writeCartId } from "@/lib/cart";

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
}

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

  const existingId = await readCartId();

  const result = existingId
    ? await cartClient.addLines(existingId, [line])
    : await cartClient.create({ lines: [line] });

  if (!result.ok) {
    // A cart the shopper still has a cookie for can expire or be completed, in
    // which case addLines fails on an id that no longer resolves. Clearing lets
    // the next attempt start a fresh cart rather than failing forever.
    if (existingId) await clearCartId();
    return { status: "error", message: describeError(result.error) };
  }

  await writeCartId(result.data.id);
  revalidate();

  return { status: "success", token: Date.now() };
};

export const updateCartLine = async (formData: FormData): Promise<void> => {
  const id = String(formData.get("lineId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 0);
  const cartId = await readCartId();
  if (!cartId || !id) return;

  // Quantity zero is how Shopify expresses removal on an update, so there is no
  // need for the caller to decide which mutation to use.
  await cartClient.updateLines(cartId, [{ id, quantity }]);
  revalidate();
};

export const removeCartLine = async (formData: FormData): Promise<void> => {
  const lineId = String(formData.get("lineId") ?? "");
  const cartId = await readCartId();
  if (!cartId || !lineId) return;

  await cartClient.removeLines(cartId, [lineId]);
  revalidate();
};
