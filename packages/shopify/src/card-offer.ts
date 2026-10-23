/**
 * What a product card offers beyond its price, the same on every surface:
 * the subscription saving, and whether it can be added straight from the grid.
 *
 * Quick add only for a product with one variant: anything with options
 * (strength, flavour) needs its product page to choose. It adds the one-time
 * purchase; subscribing, with its renewal terms, stays on the product page
 * and in the cart (subscribe-and-save.ts).
 *
 * The saving comes from the variant a shopper would get (the first in stock)
 * and only from a plan an app owns, as on the product page
 * (purchasableAllocations): an orphaned plan can't be bought.
 */

import type { MoneyLike } from "./format-money";
import { purchasableAllocations } from "./product-selection";
import { isIntroductoryPlan, subscriptionSaving } from "./subscribe-and-save";

export interface CardOfferLike {
  readonly sellingPlanGroups?: {
    readonly nodes: readonly {
      readonly appName?: string | null;
      readonly sellingPlans: { readonly nodes: readonly { readonly id: string }[] };
    }[];
  } | null;
  readonly variants?: {
    readonly nodes: readonly {
      readonly id: string;
      readonly availableForSale: boolean;
      readonly price: MoneyLike;
      readonly sellingPlanAllocations?: {
        readonly nodes: readonly {
          readonly sellingPlan: { readonly id: string };
          readonly priceAdjustments: readonly { readonly price: MoneyLike }[];
        }[];
      } | null;
    }[];
  } | null;
}

export interface CardOffer {
  /** "Subscribe & save 15%", or null with no saving to state. */
  readonly subscribe: string | null;
  /** The same saving as a number, for wording elsewhere (home.ts). */
  readonly savingPercent: number | null;
  /** The variant to add from the grid, or null to send the shopper to the page. */
  readonly quickAddVariantId: string | null;
}

export const cardOffer = (product: CardOfferLike): CardOffer => {
  const variants = product.variants?.nodes ?? [];
  const shown = variants.find((variant) => variant.availableForSale) ?? variants[0];
  const allocations = purchasableAllocations(
    product.sellingPlanGroups?.nodes ?? [],
    shown?.sellingPlanAllocations?.nodes ?? [],
  );
  const adjustments = allocations[0]?.priceAdjustments ?? [];
  // An introductory price isn't a saving on every delivery, so no claim.
  const saving =
    shown && adjustments.length > 0 && !isIntroductoryPlan(adjustments)
      ? subscriptionSaving(shown.price, adjustments[0]?.price)
      : null;
  const only = variants.length === 1 ? variants[0] : undefined;
  return {
    subscribe: saving ? `Subscribe & save ${saving.percent}%` : null,
    savingPercent: saving?.percent ?? null,
    quickAddVariantId: only?.availableForSale ? only.id : null,
  };
};
