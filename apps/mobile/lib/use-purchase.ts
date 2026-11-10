import {
  ONE_TIME,
  addButtonLabel,
  defaultSelectedOptions,
  freeGiftFor,
  displayPrice as priceForSelection,
  effectivePlanId as resolvePlanId,
  findVariantByOptions,
  plansForPack,
  purchasableAllocations,
  purchaseCards,
  selectionStatus,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useState } from "react";

import { useAddToCart } from "./use-cart";

export type Product = NonNullable<ProductByHandleResult["product"]>;

/** "Buy it once", from the shared selection model. Re-exported for the screens. */
export { ONE_TIME };

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
    ? plansForPack(
        purchasableAllocations(
          product.sellingPlanGroups.nodes,
          variant.sellingPlanAllocations.nodes,
        ),
        // The pack size sets the plan: a 90-day pack offers the 90-day plan.
        variant,
        product.variants.nodes,
      )
    : [];

  // The selection rules are shared with web (packages/shopify, SHO-127): the
  // plan in effect falls back to one-time on a variant without it, without
  // destroying the choice, and the price is the plan's price now.
  const effectivePlanId = resolvePlanId(allocations, planId);
  // Each option as a card, plans first and one-time last (purchase-cards.ts).
  // A plan ships whole packs, and sets the quantity: three 30-day packs every
  // 90 days, or one 90-day pack.
  const cards = purchaseCards(variant, allocations);
  const chosenCard = cards.find((card) => card.id === effectivePlanId);
  const quote = chosenCard?.quote ?? null;
  // This selection's free gift, in stock: added nested under it (free-gift.ts).
  const gift = variant ? freeGiftFor(product, variant) : null;
  const displayPrice = quote?.price ?? priceForSelection(variant, allocations, planId);
  const status = selectionStatus(variant);
  const soldOut = status === "soldOut";
  const disabled = status !== "available" || addToCart.isPending;

  /** The button's words, identical in both controls. */
  const label = addToCart.isPending
    ? "Adding…"
    : status === "soldOut"
      ? "Sold out"
      : status === "unavailable"
        ? "Unavailable in this combination"
        : addButtonLabel(chosenCard);

  const add = (onAdded: () => void) => {
    if (!variant) return;
    addToCart.mutate(
      {
        merchandiseId: variant.id,
        quantity: quote?.units ?? 1,
        ...(gift ? { giftId: gift.id } : {}),
        ...(effectivePlanId ? { sellingPlanId: effectivePlanId } : {}),
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
    quote,
    cards,
    chosenCard,
    gift,
    soldOut,
    disabled,
    label,
    add,
  };
};

export type Purchase = ReturnType<typeof usePurchase>;
