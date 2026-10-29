import {
  MIN_BLEND_SIZE,
  blendAttributes,
  blendSize,
  checkBlend,
  defaultSelectedOptions,
  findVariantByOptions,
  isBlendProduct,
  maxBlendSize,
  purchasableAllocations,
  variantForBlend,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useState } from "react";

import { useBlendIngredients } from "./blend";
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

  /*
   * A custom-blend pack: the shopper picks ingredients, and the count picks the
   * variant (and so the price). See packages/shopify/src/blend.ts.
   */
  const isBlend = isBlendProduct(product);
  const { data: blendIngredients = [] } = useBlendIngredients(isBlend);
  const [picked, setPicked] = useState<string[]>([]);
  const blendMax = maxBlendSize(product.variants.nodes);
  const blendReady =
    isBlend && Boolean(variantForBlend(product.variants.nodes, picked.length));

  const variant = isBlend
    ? variantForBlend(product.variants.nodes, Math.max(picked.length, MIN_BLEND_SIZE))
    : findVariantByOptions(product.variants.nodes, selected);

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
  const disabled = !variant || soldOut || addToCart.isPending || (isBlend && !blendReady);

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
    : isBlend && !blendReady
      ? `Choose ${MIN_BLEND_SIZE} to ${blendMax} ingredients`
      : soldOut
        ? "Sold out"
        : !variant
          ? "Unavailable in this combination"
          : "Add to cart";

  const add = (onAdded: () => void) => {
    if (!variant) return;
    // The label is built from Shopify's range, never typed: the warehouse
    // packs from it.
    const blend = isBlend
      ? checkBlend(picked, blendIngredients, blendSize(variant))
      : null;
    if (blend && !blend.ok) return;
    addToCart.mutate(
      {
        merchandiseId: variant.id,
        quantity: 1,
        ...(effectivePlanId ? { sellingPlanId: effectivePlanId } : {}),
        ...(blend?.ok
          ? { attributes: blendAttributes(blend.codes, blendIngredients) }
          : {}),
      },
      { onSuccess: onAdded },
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
    isBlend,
    blendIngredients,
    blendMax,
    picked,
    setPicked,
  };
};

export type Purchase = ReturnType<typeof usePurchase>;
