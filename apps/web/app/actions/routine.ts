"use server";

import {
  describeError,
  describeForShopper,
  parseAnswers,
  type CartLineInput,
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
 * "Subscribe to this routine": every ticked product in one cart request, each
 * on its subscription plan. The shopper can untick products first, which is
 * the "edit before adding" decision on SHO-161.
 *
 * Each ticked box posts `item` as "variantId|sellingPlanId" (the plan empty
 * for a one-off product).
 */
export const addRoutineToCart = async (
  _previous: CartActionState,
  formData: FormData,
): Promise<CartActionState> => {
  const lines: CartLineInput[] = formData
    .getAll("item")
    .map(String)
    .map((item) => item.split("|"))
    .filter(([merchandiseId]) =>
      merchandiseId?.startsWith("gid://shopify/ProductVariant/"),
    )
    .map(([merchandiseId, sellingPlanId]) => ({
      merchandiseId: merchandiseId!,
      quantity: 1,
      ...(sellingPlanId ? { sellingPlanId } : {}),
    }));

  if (lines.length === 0) {
    return { status: "error", message: "Tick at least one product to add." };
  }

  const { result, storedCartGone, notice } = await cartClient.addLinesOrCreate({
    cartId: await readCartId(),
    lines,
    email: readBuyerEmail,
  });

  if (!result.ok) {
    if (storedCartGone) await clearCartId();
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
