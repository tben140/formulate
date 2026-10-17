import { PRODUCT_EVENTS, addedToCartProperties } from "@formulate/analytics";
import {
  defaultSelectedOptions,
  findVariantByOptions,
  purchasableAllocations,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useState } from "react";

import { analytics } from "./product-analytics";
import { useAddToCart } from "./use-cart";

export type Product = NonNullable<ProductByHandleResult["product"]>;

/** Sentinel for "buy it once". Not a plan id, so it is never sent. */
export const ONE_TIME = "";

/**
 * Everything the product screen's buy controls share: the selection, the
 * price it implies, and the add.
 *
 * Owned by the screen rather than by `AddToCart`, because two controls render
 * it: the in-page form and the sticky bar (SHO-117). If each kept its own copy
 * of the selected variant they would drift, and the bug would only show after
 * a variant change, so it would pass a casual test. With one owner they can't.
 *
 * The selection rules come from `packages/shopify` and are the same ones
 * apps/web renders — `findVariantByOptions`, `purchasableAllocations`. Only the
 * rendering differs, which is the whole point of keeping them as pure
 * functions over plain data.
 */
export const usePurchase = (product: Product) => {
  const addToCart = useAddToCart();

  const [selected, setSelected] = useState<readonly SelectedOption[]>(() =>
    defaultSelectedOptions(product.variants.nodes),
  );
  const [planId, setPlanId] = useState<string>(ONE_TIME);

  const variant = findVariantByOptions(product.variants.nodes, selected);

  /*
   * ⚠️ Only plans whose group is owned by an installed app.
   *
   * This store's ski wax allocates three plans to its variant and two of them
   * are Shopify seed data that nothing manages. They add to the cart and
   * complete at checkout, then never charge or ship again.
   */
  const allocations = variant
    ? purchasableAllocations(
        product.sellingPlanGroups.nodes,
        variant.sellingPlanAllocations.nodes,
      )
    : [];

  // Derived rather than reset in an effect, so moving to a variant that does
  // not offer the plan falls back to one-time without destroying the choice —
  // moving back restores it.
  const effectivePlanId = allocations.some((a) => a.sellingPlan.id === planId)
    ? planId
    : ONE_TIME;

  const chosenAllocation = allocations.find((a) => a.sellingPlan.id === effectivePlanId);
  const displayPrice =
    chosenAllocation?.priceAdjustments[0]?.price ?? variant?.price ?? null;

  const soldOut = Boolean(variant && !variant.availableForSale);
  const disabled = !variant || soldOut || addToCart.isPending;

  const choices = [
    { id: ONE_TIME, label: "One-time purchase", price: variant?.price },
    ...allocations.map((allocation) => ({
      id: allocation.sellingPlan.id,
      label: allocation.sellingPlan.name,
      price: allocation.priceAdjustments[0]?.price,
    })),
  ];

  /** The button's words, identical in both controls. */
  const label = addToCart.isPending
    ? "Adding…"
    : soldOut
      ? "Sold out"
      : !variant
        ? "Unavailable in this combination"
        : "Add to cart";

  const add = (onAdded: () => void) => {
    if (!variant) return;
    addToCart.mutate(
      {
        merchandiseId: variant.id,
        quantity: 1,
        ...(effectivePlanId ? { sellingPlanId: effectivePlanId } : {}),
      },
      {
        onSuccess: ({ cart }) => {
          onAdded();
          // PostHog's product_added_to_cart (SHO-87): the line this add
          // landed in, reported as one unit at the price actually charged.
          const line = cart.lines.nodes.find(
            (l) =>
              "id" in l.merchandise &&
              l.merchandise.id === variant.id &&
              (l.sellingPlanAllocation?.sellingPlan.id ?? ONE_TIME) === effectivePlanId,
          );
          const added = line ? addedToCartProperties(line) : null;
          if (added)
            analytics()?.capture(PRODUCT_EVENTS.addedToCart, { ...added, quantity: 1 });
        },
      },
    );
  };

  return {
    addToCart,
    selected,
    setSelected,
    setPlanId,
    variant,
    allocations,
    effectivePlanId,
    displayPrice,
    soldOut,
    disabled,
    choices,
    label,
    add,
  };
};

export type Purchase = ReturnType<typeof usePurchase>;
