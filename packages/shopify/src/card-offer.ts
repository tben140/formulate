/**
 * What a product card offers beyond its price, the same on every surface:
 * the subscription saving, and whether it can be added straight from the grid.
 *
 * Quick add only for a product with one variant: anything with options
 * (strength, flavour) needs its product page to choose. It adds the one-time
 * purchase; subscribing, with its renewal terms, stays on the product page
 * and in the cart (subscribe-and-save.ts).
 */

import type { MoneyLike } from "./format-money";
import { isIntroductoryPlan, subscriptionSaving } from "./subscribe-and-save";

export interface CardOfferLike {
  readonly variants?: {
    readonly nodes: readonly {
      readonly id: string;
      readonly availableForSale: boolean;
      readonly price: MoneyLike;
      readonly sellingPlanAllocations?: {
        readonly nodes: readonly {
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
  const first = variants[0];
  const adjustments = first?.sellingPlanAllocations?.nodes[0]?.priceAdjustments ?? [];
  // An introductory price isn't a saving on every delivery, so no claim.
  const saving =
    first && adjustments.length > 0 && !isIntroductoryPlan(adjustments)
      ? subscriptionSaving(first.price, adjustments[0]?.price)
      : null;
  const only = variants.length === 1 ? variants[0] : undefined;
  return {
    subscribe: saving ? `Subscribe & save ${saving.percent}%` : null,
    savingPercent: saving?.percent ?? null,
    quickAddVariantId: only?.availableForSale ? only.id : null,
  };
};
