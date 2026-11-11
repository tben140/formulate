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

type Allocation = NonNullable<UpgradeVariant["sellingPlanAllocations"]>["nodes"][number];

/** The plans an installed app manages, by id. */
const ownedPlans = (variant: UpgradeVariant | null | undefined): Set<string> =>
  // Only plans an installed app manages (Recharge): the store has Shopify
  // seed groups no app owns, which never charge again (hasOwningApp).
  new Set(
    (variant?.product?.sellingPlanGroups.nodes ?? [])
      .filter((group) => group.appName)
      .flatMap((group) => group.sellingPlans.nodes.map((plan) => plan.id)),
  );

/** One plan as an offer: a flat saving every delivery, or null. */
const asOffer = (allocation: Allocation): UpgradeOffer | null => {
  // An introductory price changes later: no flat "save x%" claim for it.
  if (allocation.priceAdjustments.length !== 1) return null;
  const facts = readPlan(allocation.sellingPlan);
  if (!facts.every || !facts.percentOff) return null;
  return {
    sellingPlanId: allocation.sellingPlan.id,
    every: facts.every,
    percentOff: facts.percentOff,
    price: allocation.priceAdjustments[0]!.price,
  };
};

export const upgradeOffer = (
  variant: UpgradeVariant | null | undefined,
): UpgradeOffer | null => {
  const owned = ownedPlans(variant);
  for (const allocation of variant?.sellingPlanAllocations?.nodes ?? []) {
    if (!owned.has(allocation.sellingPlan.id)) continue;
    const offer = asOffer(allocation);
    if (offer?.every === OFFERED_EVERY) return offer;
  }
  return null;
};

/**
 * The plan the switch applied, read again after the tap. The offer shown was
 * read when checkout loaded; if the plan changed since (a new percentage in
 * Recharge), Shopify charges the new one, so the terms must say so.
 */
export const appliedOffer = (
  variant: UpgradeVariant | null | undefined,
  sellingPlanId: string,
): UpgradeOffer | null => {
  if (!ownedPlans(variant).has(sellingPlanId)) return null;
  const allocation = variant?.sellingPlanAllocations?.nodes.find(
    ({ sellingPlan }) => sellingPlan.id === sellingPlanId,
  );
  return allocation ? asOffer(allocation) : null;
};

/**
 * What the shopper is told after switching.
 * - "same": the plan is as shown on the button.
 * - "changed": it has a different saving or price now; state the new terms.
 * - "unknown": it couldn't be read again, or no longer has a flat saving;
 *   state the renewal without a price or a saving rather than risk a wrong one.
 */
export type SwitchResult =
  | { readonly kind: "same" | "changed"; readonly offer: UpgradeOffer }
  | { readonly kind: "unknown" };

export const switchResult = (
  shown: UpgradeOffer,
  applied: UpgradeOffer | null,
): SwitchResult => {
  if (!applied || applied.sellingPlanId !== shown.sellingPlanId)
    return { kind: "unknown" };
  const same =
    applied.percentOff === shown.percentOff &&
    applied.every === shown.every &&
    Number(applied.price.amount) === Number(shown.price.amount) &&
    applied.price.currencyCode === shown.price.currencyCode;
  return { kind: same ? "same" : "changed", offer: applied };
};

const CANCEL_ANY_TIME = "You can skip, pause or cancel any time.";

/** The renewal terms, beside the switch: California's ARL, the UK's DMCC rules. */
export const upgradeTerms = (offer: UpgradeOffer, perDelivery: string): string =>
  `Renews automatically ${offer.every} at ${perDelivery} a delivery until you cancel. ${CANCEL_ANY_TIME}`;

/** The terms without a price, when the plan couldn't be read again. */
export const unpricedTerms = (every: string): string =>
  `Renews automatically ${every} until you cancel. ${CANCEL_ANY_TIME}`;

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
