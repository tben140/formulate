import { formatMoney, type MoneyLike } from "./format-money";
import { ONE_TIME } from "./product-selection";
import {
  deliveryQuote,
  MAX_SUPPLY_UNITS,
  packAdjective,
  packSize,
  planIntervalDays,
  pricePerDay,
  supplyTitle,
  type DeliveryQuote,
  type PlanOptionLike,
} from "./subscribe-and-save";

/**
 * The purchase options as cards, shared by web, the app and (restated in
 * Liquid) the theme: each subscription plan as a card named by the supply it
 * ships ("90-day supply"), and one-time purchase last.
 *
 * ⚠️ UK law shapes these (and US law agrees):
 *
 * - **Nothing is chosen for the shopper.** One-time stays the default
 *   (`ONE_TIME`); consent to recurring payments can't come from a default
 *   (Consumer Contracts Regulations 2013, reg. 40; CMA on online choice
 *   architecture). The subscription cards may come first and look better;
 *   one-time stays a card of its own, not a link.
 * - **Prices are per delivery, at the real interval.** Never a "/mo" for a
 *   plan that doesn't bill monthly.
 * - **No badge that isn't true.** "Best value" goes only on the plan that
 *   saves the most, and so costs least a day, and only when no other plan
 *   saves as much (`bestValue`): with every plan at 15%, no card has it. Never
 *   "most popular": there's no sales data.
 */

export interface PurchaseCard {
  /** The selling plan id, or ONE_TIME. */
  readonly id: string;
  /** "90-day supply", or "One-time purchase". */
  readonly title: string;
  /** "3 × 30-day packs, delivered every 90 days", or "30-day supply". */
  readonly detail: string | null;
  readonly quote: DeliveryQuote;
  /** "45p a day", "£1.10 a serving". */
  readonly perDay: string | null;
  /** The saving against buying the same once, in whole percent. */
  readonly savePercent: number | null;
  /**
   * The one plan that saves the most. Every card has the same pack, so it's
   * also the cheapest a day or a serving.
   */
  readonly bestValue: boolean;
}

interface CardVariantLike {
  readonly price: MoneyLike;
  readonly selectedOptions: readonly { readonly name: string; readonly value: string }[];
}

interface CardAllocationLike {
  readonly sellingPlan: {
    readonly id: string;
    readonly name: string;
    readonly options?: readonly PlanOptionLike[] | null;
  };
  readonly priceAdjustments: readonly { readonly price: MoneyLike }[];
}

/**
 * The cards for a variant: its plans (already filtered, e.g. by plansForPack),
 * shortest interval first, then one-time.
 */
export const purchaseCards = (
  variant: CardVariantLike | undefined,
  allocations: readonly CardAllocationLike[],
): PurchaseCard[] => {
  if (!variant) return [];
  const pack = packSize(variant.selectedOptions);
  const plans = allocations
    .map((allocation) => ({
      allocation,
      days: planIntervalDays(allocation.sellingPlan.options),
    }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity))
    .map(({ allocation, days }): PurchaseCard => {
      const quote = deliveryQuote(variant.price, allocation, pack);
      const packs =
        quote.units > 1 && quote.units <= MAX_SUPPLY_UNITS
          ? `${quote.units} × ${packAdjective(pack.count, pack.unit)} packs`
          : null;
      const cadence = days ? `delivered every ${days} days` : null;
      return {
        id: allocation.sellingPlan.id,
        // A plan that doesn't state its interval keeps its own name.
        title: days ? supplyTitle(quote.units, pack) : allocation.sellingPlan.name,
        detail:
          packs && cadence
            ? `${packs}, ${cadence}`
            : cadence
              ? capitalise(cadence)
              : packs,
        quote,
        perDay: pricePerDay(quote.price, quote.days, pack.unit),
        savePercent: quote.saving?.percent ?? null,
        bestValue: false,
      };
    });
  const best = bestValueIndex(plans.map((plan) => plan.savePercent));
  const oneTime = deliveryQuote(variant.price, null, pack);
  return [
    ...plans.map((plan, index) => (index === best ? { ...plan, bestValue: true } : plan)),
    {
      id: ONE_TIME,
      title: "One-time purchase",
      detail: supplyTitle(1, pack),
      quote: oneTime,
      perDay: pricePerDay(oneTime.price, oneTime.days, pack.unit),
      savePercent: null,
      bestValue: false,
    },
  ];
};

/**
 * Which of the plans' savings (whole percent) is best value: the highest, if
 * it's above zero and no other plan saves as much. -1 for none, and for a
 * lone plan: there's nothing to compare it with.
 */
export const bestValueIndex = (percents: readonly (number | null)[]): number => {
  if (percents.length < 2) return -1;
  const top = Math.max(0, ...percents.map((percent) => percent ?? 0));
  if (top === 0) return -1;
  const at = percents.flatMap((percent, index) => (percent === top ? [index] : []));
  return at.length === 1 ? (at[0] ?? -1) : -1;
};

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The add button, naming the deal: "Subscribe and save 15% – £40.68", or
 * "Add to cart – £15.95". Surfaces use their own words while adding, or
 * when the selection can't be bought.
 */
export const addButtonLabel = (card: PurchaseCard | undefined): string => {
  if (!card) return "Add to cart";
  const price = formatMoney(card.quote.price);
  if (card.id === ONE_TIME) return `Add to cart – ${price}`;
  return card.savePercent
    ? `Subscribe and save ${card.savePercent}% – ${price}`
    : `Subscribe – ${price}`;
};
