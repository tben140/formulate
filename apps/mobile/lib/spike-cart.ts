import { CartCreateMutation, describeError } from "@formulate/shopify";

import { storefront } from "./storefront";

/**
 * SPIKE ONLY (SHO-56). Minimal cart creation to obtain a checkoutUrl.
 *
 * Real cart work — persistence, line mutations, optimistic updates, the
 * `?key=` secret handling — belongs to P1 — Cart & selling plans.
 */

export interface SpikeCart {
  readonly id: string;
  readonly checkoutUrl: string;
  readonly totalQuantity: number;
}

/**
 * The Recharge-managed selling plan on the demo store, and the variant it is
 * allocated to. Hardcoded because this is a spike — real code discovers these
 * through `sellingPlanAllocations` on the variant.
 *
 * Recharge's group is distinguishable from the four Shopify-native demo groups
 * by `appName: "294517"` on the Storefront API.
 */
export const RECHARGE_SKI_WAX_VARIANT = "gid://shopify/ProductVariant/52607188009272";
export const RECHARGE_30_DAY_PLAN = "gid://shopify/SellingPlan/697746522424";

export interface SpikeLine {
  readonly merchandiseId: string;
  readonly sellingPlanId?: string;
}

export const createSpikeCartWithLines = async (
  lines: readonly SpikeLine[],
): Promise<SpikeCart> => {
  const result = await storefront.request(CartCreateMutation, {
    lines: lines.map((line) => ({
      merchandiseId: line.merchandiseId,
      quantity: 1,
      ...(line.sellingPlanId ? { sellingPlanId: line.sellingPlanId } : {}),
    })),
  });

  if (!result.ok) throw new Error(describeError(result.error));

  const payload = result.data.cartCreate;

  if (payload?.userErrors.length) {
    throw new Error(payload.userErrors.map((e) => e.message).join("; "));
  }

  const cart = payload?.cart;
  if (!cart) throw new Error("cartCreate returned no cart");

  return {
    id: cart.id,
    checkoutUrl: cart.checkoutUrl,
    totalQuantity: cart.totalQuantity,
  };
};

export const createSpikeCart = async (
  merchandiseId: string,
  sellingPlanId?: string,
): Promise<SpikeCart> => createSpikeCartWithLines([{ merchandiseId, sellingPlanId }]);
