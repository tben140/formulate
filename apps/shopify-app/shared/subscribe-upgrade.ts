/**
 * Switching a one-time line to Subscribe & save at checkout.
 *
 * Recharge's own block for this (Checkout Upsell) needs its Pro plan; on a
 * Plus store a checkout extension can make the same change itself, by
 * setting the line's selling plan (applyCartLinesChange). The order still
 * goes to Recharge as a subscription, as if the plan was chosen earlier.
 *
 * Offered only where the product page would offer it, and only the plan
 * that keeps the line's meaning: every 30 days, one 30-day supply a
 * delivery, so the quantity stays the shopper's. The 60- and 90-day plans
 * set the quantity themselves (deliveryQuote in packages/shopify), which a
 * one-tap switch shouldn't do behind their back.
 */

import { readPlan, type PlanInput } from "./subscription-plan";

interface Money {
  readonly amount: string;
  readonly currencyCode: string;
}

export interface UpgradeVariant {
  readonly id?: string;
  readonly product?: {
    readonly sellingPlanGroups: {
      readonly nodes: readonly {
        readonly appName: string | null;
        readonly sellingPlans: { readonly nodes: readonly { readonly id: string }[] };
      }[];
    };
  };
  readonly sellingPlanAllocations?: {
    readonly nodes: readonly {
      readonly sellingPlan: PlanInput & { readonly id: string };
      readonly priceAdjustments: readonly { readonly price: Money }[];
    }[];
  };
}

export interface UpgradeOffer {
  readonly sellingPlanId: string;
  /** "every 30 days" */
  readonly every: string;
  readonly percentOff: number;
  /** The price of one unit on the plan, every delivery. */
  readonly price: Money;
}

/** The interval this switch offers: one 30-day supply a delivery. */
const OFFERED_EVERY = "every 30 days";

export const upgradeOffer = (variant: UpgradeVariant | null | undefined): UpgradeOffer | null => {
  // Only plans an installed app manages (Recharge): the store has Shopify
  // seed groups no app owns, which never charge again (hasOwningApp).
  const owned = new Set(
    (variant?.product?.sellingPlanGroups.nodes ?? [])
      .filter((group) => group.appName)
      .flatMap((group) => group.sellingPlans.nodes.map((plan) => plan.id)),
  );
  for (const allocation of variant?.sellingPlanAllocations?.nodes ?? []) {
    if (!owned.has(allocation.sellingPlan.id)) continue;
    // An introductory price changes later: no flat "save x%" claim for it.
    if (allocation.priceAdjustments.length !== 1) continue;
    const facts = readPlan(allocation.sellingPlan);
    const price = allocation.priceAdjustments[0]!.price;
    if (facts.every === OFFERED_EVERY && facts.percentOff) {
      return {
        sellingPlanId: allocation.sellingPlan.id,
        every: facts.every,
        percentOff: facts.percentOff,
        price,
      };
    }
  }
  return null;
};

/** The renewal terms, beside the switch: California's ARL, the UK's DMCC rules. */
export const upgradeTerms = (offer: UpgradeOffer, perDelivery: string): string =>
  `Renews automatically ${offer.every} at ${perDelivery} a delivery until you cancel. You can skip, pause or cancel any time.`;

export const UPGRADE_QUERY = `query SubscribeUpgrade($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on ProductVariant {
      id
      product {
        sellingPlanGroups(first: 10) {
          nodes {
            appName
            sellingPlans(first: 20) { nodes { id } }
          }
        }
      }
      sellingPlanAllocations(first: 20) {
        nodes {
          sellingPlan {
            id
            options { name value }
            priceAdjustments {
              orderCount
              adjustmentValue {
                __typename
                ... on SellingPlanPercentagePriceAdjustment { adjustmentPercentage }
              }
            }
          }
          priceAdjustments { price { amount currencyCode } }
        }
      }
    }
  }
}`;

export interface UpgradeQueryData {
  readonly nodes: readonly (UpgradeVariant | null)[];
}
