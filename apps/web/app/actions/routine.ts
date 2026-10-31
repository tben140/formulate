"use server";

import {
  describeError,
  describeForShopper,
  newRoutineId,
  parseAnswers,
  routineCartLines,
  type RoutinePick,
} from "@formulate/shopify";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  cartClient,
  clearCartId,
  readBuyerEmail,
  readCartId,
  writeCartId,
} from "@/lib/cart";
import { clearSavedAnswers, getRoutineGoals, writeSavedAnswers } from "@/lib/routine";

import type { CartActionState } from "./cart";

/**
 * A product title as the form posted it. It only labels the routine (a line
 * property the shopper sees), so a malformed or forged one is cut short, not
 * trusted for anything.
 */
const readableTitle = (encoded = ""): string => {
  try {
    return decodeURIComponent(encoded).slice(0, 80);
  } catch {
    return "";
  }
};

/**
 * "Subscribe to this routine": every ticked product in one cart request, each
 * on its subscription plan. The shopper can untick products first, which is
 * the "edit before adding" decision on SHO-161.
 *
 * The subscriptions share a routine id as a line property, so Recharge renews
 * them together and the portal can treat them as one routine (SHO-176,
 * `routineCartLines`).
 *
 * Each ticked box posts `item` as "variantId|sellingPlanId|title|planDays"
 * (the plan and its days empty for a one-off product, the title URI-encoded).
 *
 * All or nothing: if one product is sold out, Shopify still adds the others.
 * The cart is put back as it was, so a retry can't leave a second copy of
 * them in it.
 */
export const addRoutineToCart = async (
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> => {
  const picks: RoutinePick[] = formData
    .getAll("item")
    .map(String)
    .map((item) => item.split("|"))
    .filter(([variantId]) => variantId?.startsWith("gid://shopify/ProductVariant/"))
    .map(([variantId, sellingPlanId, title, planDays]) => ({
      variantId: variantId!,
      sellingPlanId: sellingPlanId || null,
      planDays: Number(planDays) || null,
      title: readableTitle(title),
    }));
  const lines = routineCartLines(picks, newRoutineId());

  if (lines.length === 0) {
    return { status: "error", message: "Tick at least one product to add." };
  }

  const cartId = await readCartId();
  const before = cartId ? await lineQuantities(cartId) : null;
  const { result, storedCartGone, notice } = await cartClient.addLinesOrCreate({
    cartId,
    lines,
    email: readBuyerEmail,
  });

  if (!result.ok) {
    if (storedCartGone) await clearCartId();
    else if (cartId && before) await restoreLines(cartId, before);
    console.error(`[routine] add failed: ${describeError(result.error)}`);
    return { status: "error", message: describeForShopper(result.error) };
  }

  await writeCartId(result.data.id);
  revalidatePath("/", "layout");

  return {
    status: "success",
    ...(notice ? { message: notice } : {}),
    token: Date.now(),
    cart: result.data,
  };
};

/** Each line's quantity, by line id; null if the cart can't be read. */
const lineQuantities = async (cartId: string) => {
  const cart = await cartClient.get(cartId);
  if (!cart.ok || !cart.data) return null;
  return new Map(cart.data.lines.nodes.map((line) => [line.id, line.quantity]));
};

/**
 * Puts the cart back as it was before a partial add: lines it added are
 * removed, and lines it topped up (the same product and plan already in the
 * cart) go back to their old quantity. Best effort; on failure the shopper
 * sees the extra lines and can remove them. (A new cart made by a failed add
 * was never saved, so it needs nothing.)
 */
const restoreLines = async (cartId: string, before: Map<string, number>) => {
  const cart = await cartClient.get(cartId);
  if (!cart.ok || !cart.data) return;
  const lines = cart.data.lines.nodes;
  const added = lines.filter((line) => !before.has(line.id)).map((line) => line.id);
  const toppedUp = lines
    .filter((line) => line.quantity > (before.get(line.id) ?? line.quantity))
    .map((line) => ({ id: line.id, quantity: before.get(line.id)! }));
  if (added.length > 0) await cartClient.removeLines(cartId, added);
  if (toppedUp.length > 0) await cartClient.updateLines(cartId, toppedUp);
};

/** "Save my routine": keeps the answers and opens "Your routine". */
export const saveRoutine = async (formData: FormData): Promise<void> => {
  const goals = await getRoutineGoals();
  const answers = parseAnswers(
    new URLSearchParams(String(formData.get("answers") ?? "")),
    goals.map((goal) => goal.key),
  );
  if (answers) await writeSavedAnswers(answers);
  redirect("/routine/yours");
};

export const forgetRoutine = async (): Promise<void> => {
  await clearSavedAnswers();
  redirect("/routine");
};
