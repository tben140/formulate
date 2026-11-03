import type { OfferRules } from "@formulate/shopify";

/**
 * Margin guardrails: what a unit can sell for under a campaign at worst,
 * against what it costs (Shopify's per-variant unit cost). Catches a 25% offer
 * on a product that only carries 20%, before it goes live.
 *
 * Worst case, per offer:
 * - percent: the price less the percentage;
 * - tiered: less the highest tier's percentage;
 * - bundle: the cheapest units free, so in the worst basket (every unit the
 *   same price) a unit sells for (buy - free) / buy of its price.
 * When the offer reaches subscriptions too (oneTimeOnly false), subscribe and
 * save's 15% comes off first: the two stack.
 */

/** Subscribe and save, on every subscription product (docs/campaigns.md). */
export const SUBSCRIBE_AND_SAVE = 15;

/** The margin floor `campaigns check` warns under, unless --min-margin says otherwise. */
export const DEFAULT_MIN_MARGIN = 30;

/** A unit's lowest price under the offer, to the penny. */
export const worstUnitPrice = (rules: OfferRules, price: number): number => {
  const base = rules.oneTimeOnly ? price : price * (1 - SUBSCRIBE_AND_SAVE / 100);
  const factor =
    rules.type === "percent"
      ? 1 - rules.percent / 100
      : rules.type === "tiered"
        ? 1 - Math.max(...rules.tiers.map((tier) => tier.percent)) / 100
        : rules.type === "bundle"
          ? (rules.buy - rules.free) / rules.buy
          : // A gift doesn't lower the items' price; its own cost is the gift's margin.
            1;
  return Math.round(base * factor * 100) / 100;
};

export interface MarginRow {
  readonly title: string;
  readonly price: number;
  readonly cost: number | null;
  readonly worst: number;
  /** (worst - cost) / worst, as a percentage; null without a cost. */
  readonly margin: number | null;
}

export const marginRows = (
  rules: OfferRules,
  variants: readonly { title: string; price: string; cost: string | null }[],
): MarginRow[] =>
  variants.map((variant) => {
    const price = Number(variant.price);
    const worst = worstUnitPrice(rules, price);
    const cost = variant.cost === null ? null : Number(variant.cost);
    return {
      title: variant.title,
      price,
      cost,
      worst,
      margin:
        cost === null || worst <= 0
          ? null
          : Math.round(((worst - cost) / worst) * 1000) / 10,
    };
  });
