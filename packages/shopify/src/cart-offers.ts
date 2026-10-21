import { formatMoney, type MoneyLike } from "./format-money";
import { purchasableAllocations, type SellingPlanGroupLike } from "./product-selection";

/**
 * Two cart nudges, shared by web, the app and (restated in Liquid) the theme.
 *
 * Both only say true things: a saving the shopper would really get, and a
 * discount the store's Function would really apply.
 */

/* -------------------------------------------------------------------------- */
/*  Switch a one-time line to a subscription                                   */
/* -------------------------------------------------------------------------- */

interface OfferAllocation {
  readonly sellingPlan: {
    readonly id: string;
    readonly name: string;
    readonly recurringDeliveries: boolean;
  };
  readonly priceAdjustments: readonly { readonly price: MoneyLike }[];
}

/** What `subscribeOffer` reads from a cart line (CartFields). */
export interface OfferLine {
  readonly quantity: number;
  readonly sellingPlanAllocation?: unknown;
  readonly merchandise: {
    readonly price: MoneyLike;
    readonly product: {
      readonly sellingPlanGroups: { readonly nodes: readonly SellingPlanGroupLike[] };
    };
    readonly sellingPlanAllocations: { readonly nodes: readonly OfferAllocation[] };
  };
}

export interface SubscribeOffer {
  readonly sellingPlanId: string;
  readonly planName: string;
  /** For the whole line: the unit saving times the quantity. */
  readonly saving: MoneyLike;
}

const minor = (money: MoneyLike): number | null => {
  const value = Number(money.amount);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
};

/**
 * "Switch to subscribe & save £x" for a one-time line, or null when there's
 * nothing true to offer: it's a subscription already, no app-managed
 * subscription plan exists for it, or subscribing saves nothing.
 *
 * Offers the first subscription plan, the shortest interval as the store
 * lists them (every 30 days, matching the 30-day supply).
 */
export const subscribeOffer = (line: OfferLine): SubscribeOffer | null => {
  if (line.sellingPlanAllocation) return null;
  const { merchandise } = line;
  const plan = purchasableAllocations(
    merchandise.product.sellingPlanGroups.nodes,
    merchandise.sellingPlanAllocations.nodes,
  ).find((allocation) => allocation.sellingPlan.recurringDeliveries);
  const planPrice = plan?.priceAdjustments[0]?.price;
  if (!plan || !planPrice || planPrice.currencyCode !== merchandise.price.currencyCode) {
    return null;
  }
  const full = minor(merchandise.price);
  const reduced = minor(planPrice);
  if (full === null || reduced === null || reduced >= full) return null;
  return {
    sellingPlanId: plan.sellingPlan.id,
    planName: plan.sellingPlan.name,
    saving: {
      amount: (((full - reduced) * line.quantity) / 100).toFixed(2),
      currencyCode: merchandise.price.currencyCode,
    },
  };
};

/** The button's words: "Subscribe & save £2.39 a delivery". */
export const subscribeOfferLabel = (offer: SubscribeOffer): string =>
  `Subscribe & save ${formatMoney(offer.saving)} a delivery`;

/* -------------------------------------------------------------------------- */
/*  "Build your stack" progress                                                */
/* -------------------------------------------------------------------------- */

/**
 * ⚠️ A copy of the stack-discount Function's rule
 * (apps/shopify-app/extensions/stack-discount): 3 different products in the
 * order, then 10% off the one-time items. The storefront can't read the
 * Function's settings, so change both together.
 */
export const STACK_SIZE = 3;
export const STACK_PERCENT = 10;

/** What `stackProgress` reads from a cart line. */
export interface StackLine {
  readonly sellingPlanAllocation?: unknown;
  readonly merchandise: { readonly product: { readonly id: string } };
}

export type StackProgress =
  | { readonly kind: "away"; readonly productsNeeded: number }
  | { readonly kind: "applied" };

/**
 * How close the cart is to the stack discount, or null when it can't help:
 * an empty cart, or one with no one-time items to discount (subscriptions
 * count towards the three, but aren't discounted again).
 */
export const stackProgress = (lines: readonly StackLine[]): StackProgress | null => {
  if (!lines.some((line) => !line.sellingPlanAllocation)) return null;
  const products = new Set(lines.map((line) => line.merchandise.product.id)).size;
  return products >= STACK_SIZE
    ? { kind: "applied" }
    : { kind: "away", productsNeeded: STACK_SIZE - products };
};

export const stackMessage = (progress: StackProgress): string =>
  progress.kind === "applied"
    ? `Build your stack: ${STACK_PERCENT}% off your one-time items, at checkout`
    : `Add ${progress.productsNeeded} more different product${progress.productsNeeded > 1 ? "s" : ""} for ${STACK_PERCENT}% off your one-time items`;
