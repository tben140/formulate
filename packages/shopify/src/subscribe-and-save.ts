import { FREE_SHIPPING_THRESHOLD } from "./free-shipping";
import { formatMoney, type MoneyLike } from "./format-money";

/**
 * The words around subscribing, shared by web, the app and (restated in
 * Liquid) the theme, so all three make the same offer the same way.
 *
 * ⚠️ Pricing and subscription law shapes these:
 *
 * - **The struck-through price is the one-time price for the same product,
 *   on sale right now.** That's a comparison of two real offers, which UK
 *   pricing law (CMA guidance under the DMCC Act 2024) and the FTC's Guides
 *   Against Deceptive Pricing (16 CFR 233) both allow. Never a "was" price
 *   nobody paid.
 * - **The renewal terms sit next to the button**, before purchase: what's
 *   charged, how often, and that it continues until cancelled. California's
 *   Automatic Renewal Law requires this now; the UK's subscription contracts
 *   regime (DMCC Act, expected spring 2027) will.
 * - **One-time stays the default.** Nothing here pre-selects a subscription.
 */

/**
 * A pack lasts 30 days unless its variant says otherwise (packSize): most
 * Double Helix formats are a 30-day supply (docs/catalogue).
 */
export const SUPPLY_DAYS = 30;

/**
 * What one unit of a variant holds: days, or servings for powders sold by the
 * serving. A serving counts as a day when matching a pack to a plan.
 */
export interface PackSize {
  readonly count: number;
  readonly unit: "day" | "serving";
}

export const DEFAULT_PACK: PackSize = { count: SUPPLY_DAYS, unit: "day" };

const PACK_VALUE = /^(\d+)\s*(day|serving)s?$/i;

/**
 * The pack a variant is, from a pack-size option value ("90 days",
 * "60 servings"), or a 30-day pack when no option says.
 */
export const packSize = (
  selectedOptions:
    | readonly { readonly name?: string | null; readonly value?: string | null }[]
    | null
    | undefined,
): PackSize => {
  for (const option of selectedOptions ?? []) {
    const match = PACK_VALUE.exec((option.value ?? "").trim());
    if (match && Number(match[1]) > 0) {
      return {
        count: Number(match[1]),
        unit: match[2]!.toLowerCase() === "serving" ? "serving" : "day",
      };
    }
  }
  return DEFAULT_PACK;
};

/** "90-day", "60-serving": a pack's size as a modifier. */
export const packAdjective = (count: number, unit: PackSize["unit"]): string =>
  `${count}-${unit}`;

/** "90-day supply", "60 servings": what a delivery of `units` packs holds. */
export const supplyTitle = (units: number, pack: PackSize = DEFAULT_PACK): string =>
  pack.unit === "serving"
    ? `${units * pack.count} servings`
    : `${packAdjective(units * pack.count, "day")} supply`;

/**
 * What every subscription gives, listed on the chosen plan's card: both are
 * true (SHO-99 and the portal, SHO-73).
 */
export const SUBSCRIPTION_PERKS: readonly string[] = [
  "Free delivery",
  "Skip, pause or cancel any time from your account",
];

/** The perks on one line. */
export const SUBSCRIPTION_BENEFITS = "Free delivery · Skip, pause or cancel any time";

/** On the product page, near the price. */
export const deliveryPromise = (): string =>
  // "£40", not "£40.00": a round threshold reads as one, as the theme says it.
  `Free UK delivery on subscriptions, and on orders over ${formatMoney(FREE_SHIPPING_THRESHOLD).replace(/\.00$/, "")}`;

const minor = (money: MoneyLike): number | null => {
  const value = Number(money.amount);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
};

export interface SubscriptionSaving {
  /** One-time price minus the subscription price. */
  readonly amount: MoneyLike;
  /**
   * Whole percent, to the nearest: a 15% plan on £15.95 is £13.56 after
   * rounding the price, which is 14.98% off, and the plan itself says 15%.
   */
  readonly percent: number;
}

/**
 * What subscribing saves against buying once, or null when it saves nothing
 * (or the prices can't be compared). Only then is there anything to strike
 * through.
 */
export const subscriptionSaving = (
  oneTime: MoneyLike | null | undefined,
  subscription: MoneyLike | null | undefined,
): SubscriptionSaving | null => {
  if (!oneTime || !subscription || oneTime.currencyCode !== subscription.currencyCode) {
    return null;
  }
  const full = minor(oneTime);
  const reduced = minor(subscription);
  if (full === null || reduced === null || full <= 0 || reduced >= full) return null;
  return {
    amount: {
      amount: ((full - reduced) / 100).toFixed(2),
      currencyCode: oneTime.currencyCode,
    },
    percent: Math.round(((full - reduced) / full) * 100),
  };
};

/** "Save £2.39 a delivery (15%)". */
export const savingMessage = (saving: SubscriptionSaving): string =>
  `Save ${formatMoney(saving.amount)} a delivery (${saving.percent}%)`;

/**
 * The price per day of a supply (30 days unless `days` says, e.g. a 90-day
 * delivery), rounded to the nearest penny:
 * "45p a day", or "£1.20 a day". Null when the price isn't readable.
 * With `unit` "serving", `days` is servings: "£1.10 a serving".
 */
export const pricePerDay = (
  price: MoneyLike | null | undefined,
  days: number = SUPPLY_DAYS,
  unit: PackSize["unit"] = "day",
): string | null => {
  if (!price) return null;
  const total = minor(price);
  if (total === null || total <= 0 || days <= 0) return null;
  const perDay = Math.round(total / days);
  const per = unit === "serving" ? "a serving" : "a day";
  if (price.currencyCode === "GBP" && perDay < 100) return `${perDay}p ${per}`;
  return `${formatMoney({ amount: (perDay / 100).toFixed(2), currencyCode: price.currencyCode })} ${per}`;
};

/** A selling plan option, e.g. Recharge's "Order Frequency and Unit": "60-day". */
export interface PlanOptionLike {
  readonly name: string | null;
  readonly value: string | null;
}

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

/**
 * Days between deliveries, from Recharge's "Order Frequency and Unit" option
 * ("30-day", "2-week", "1-month"), or null when a plan doesn't say.
 */
export const planIntervalDays = (
  options: readonly PlanOptionLike[] | null | undefined,
): number | null => {
  const value = options?.find((o) => /frequency/i.test(o.name ?? ""))?.value ?? "";
  const match = /^(\d+)\s*-?\s*(day|week|month)s?$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * (UNIT_DAYS[match[2]!.toLowerCase()] ?? 0) || null;
};

/**
 * How many packs each delivery of a plan holds, so the shopper never runs
 * out: for 30-day packs, 1 every 30 days, 2 every 60, 3 every 90; a 90-day
 * pack on the 90-day plan is 1. Always at least 1, and 1 when the plan
 * doesn't say. The plan sets the quantity; the shopper doesn't choose it.
 */
export const supplyUnits = (
  options: readonly PlanOptionLike[] | null | undefined,
  pack: PackSize = DEFAULT_PACK,
): number => {
  const days = planIntervalDays(options);
  return days ? Math.max(1, Math.round(days / pack.count)) : 1;
};

/** The most packs one delivery ships. */
export const MAX_SUPPLY_UNITS = 3;

interface PackedVariantLike {
  readonly selectedOptions: readonly { readonly name: string; readonly value: string }[];
}

/**
 * The plans worth offering on a variant: **the pack size sets the plan.**
 *
 * - A plan must ship whole packs, at most MAX_SUPPLY_UNITS of them: a 90-day
 *   pack has no 30-day plan, and a single serving none at all.
 * - A plan the product has its own pack for goes to that pack: with a 90-day
 *   pack on sale, the 30-day pack doesn't also offer three of itself every 90
 *   days, at a different price for the same supply.
 *
 * A plan that doesn't state its interval stays, shipping one pack.
 */
export const plansForPack = <
  A extends {
    readonly sellingPlan: { readonly options?: readonly PlanOptionLike[] | null };
  },
>(
  allocations: readonly A[],
  variant: PackedVariantLike | undefined,
  variants: readonly PackedVariantLike[],
): A[] => {
  if (!variant) return [...allocations];
  const pack = packSize(variant.selectedOptions);
  const packOption = variant.selectedOptions.find((option) =>
    PACK_VALUE.test(option.value.trim()),
  );
  // The same product in other pack sizes: every other option matches.
  const siblingPacks = new Set(
    packOption
      ? variants
          .filter(
            (other) =>
              other !== variant &&
              variant.selectedOptions.every(
                (option) =>
                  option.name === packOption.name ||
                  other.selectedOptions.some(
                    (o) => o.name === option.name && o.value === option.value,
                  ),
              ),
          )
          .map((other) => packSize(other.selectedOptions))
          .filter((other) => other.unit === pack.unit)
          .map((other) => other.count)
      : [],
  );
  return allocations.filter((allocation) => {
    const days = planIntervalDays(allocation.sellingPlan.options);
    if (!days) return true;
    const units = days / pack.count;
    return (
      Number.isInteger(units) &&
      units >= 1 &&
      units <= MAX_SUPPLY_UNITS &&
      (units === 1 || !siblingPacks.has(days))
    );
  });
};

const times = (money: MoneyLike, units: number): MoneyLike => {
  const value = minor(money);
  return value === null
    ? money
    : { amount: ((value * units) / 100).toFixed(2), currencyCode: money.currencyCode };
};

/** What one delivery of a purchase option holds and costs. */
export interface DeliveryQuote {
  /** Packs per delivery: the cart line's quantity. */
  readonly units: number;
  /** What each pack holds. */
  readonly pack: PackSize;
  /** Days (or servings) the delivery lasts, for the price per day. */
  readonly days: number;
  /** The price of one delivery, for all its units. */
  readonly price: MoneyLike;
  /** The same units bought once: the struck-through comparison. */
  readonly oneTime: MoneyLike;
  /** What subscribing saves on this delivery, or null (one-time, introductory plans). */
  readonly saving: SubscriptionSaving | null;
  /** An introductory plan's later price for the same units, for renewalTerms. */
  readonly later: MoneyLike | null;
}

/**
 * One delivery of a purchase option: `allocation` is the chosen plan's
 * selling plan allocation, or null for one-time. Prices are Shopify's per
 * unit, multiplied by the units the plan ships.
 */
export const deliveryQuote = (
  unitPrice: MoneyLike,
  allocation:
    | {
        readonly sellingPlan: { readonly options?: readonly PlanOptionLike[] | null };
        readonly priceAdjustments: readonly { readonly price: MoneyLike }[];
      }
    | null
    | undefined,
  pack: PackSize = DEFAULT_PACK,
): DeliveryQuote => {
  const units = allocation ? supplyUnits(allocation.sellingPlan.options, pack) : 1;
  const planPrice = allocation?.priceAdjustments[0]?.price ?? unitPrice;
  const price = times(planPrice, units);
  const oneTime = times(unitPrice, units);
  const saving =
    allocation && !isIntroductoryPlan(allocation.priceAdjustments)
      ? subscriptionSaving(oneTime, price)
      : null;
  const laterUnit = allocation?.priceAdjustments[1]?.price;
  const later = laterUnit ? times(laterUnit, units) : null;
  return { units, pack, days: units * pack.count, price, oneTime, saving, later };
};

/**
 * "90-day supply (3 × 30-day packs)": what a multi-unit delivery holds, or
 * null for a single pack.
 */
export const supplyLabel = (
  units: number,
  pack: PackSize = DEFAULT_PACK,
): string | null =>
  units > 1
    ? `${supplyTitle(units, pack)} (${units} × ${packAdjective(pack.count, pack.unit)} packs)`
    : null;

/**
 * Whether a plan's price changes after an introductory period (it has a
 * second price adjustment at a different price). Such a plan gets no saving
 * claim and no strikethrough: "save £x a delivery" wouldn't hold for every
 * delivery. This store has none today (SHO-179 would revisit).
 */
export const isIntroductoryPlan = (
  adjustments: readonly { readonly price: MoneyLike }[],
): boolean => {
  const [first, later] = adjustments;
  return Boolean(
    first &&
    later &&
    (later.price.amount !== first.price.amount ||
      later.price.currencyCode !== first.price.currencyCode),
  );
};

/**
 * The renewal terms, beside the button whenever a subscription is chosen.
 * `plan` is the selling plan's name, e.g. "Delivery every 30 days".
 *
 * `price` and `later` are per delivery, for all its `units` (deliveryQuote).
 *
 * `later` is the price after an introductory period (isIntroductoryPlan):
 * both prices are stated, and when the change happens is left to the
 * checkout summary, which shows it, rather than guessed here.
 */
export const renewalTerms = (
  price: MoneyLike,
  plan: string,
  later?: MoneyLike | null,
  units: number = 1,
  pack: PackSize = DEFAULT_PACK,
): string => {
  const changes =
    later && (later.amount !== price.amount || later.currencyCode !== price.currencyCode);
  const each =
    units > 1 ? `each delivery of ${supplyArticle(units, pack)}` : "each delivery";
  const charge = changes
    ? `${formatMoney(price)} for an introductory period, then ${formatMoney(later)} for ${each} after that (checkout shows exactly when it changes), charged automatically`
    : `${formatMoney(price)} is charged for ${each}, automatically,`;
  return `${plan}: ${charge} until you cancel. You can skip, pause or cancel any time from your account.`;
};

/** "a 90-day supply", "60 servings". */
const supplyArticle = (units: number, pack: PackSize): string =>
  pack.unit === "serving" ? supplyTitle(units, pack) : `a ${supplyTitle(units, pack)}`;

/** For the sticky bars, which have room for one line beside their button. */
export const RENEWAL_SHORT = "Renews automatically until you cancel";
