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

/** Every Double Helix format is a 30-day supply (docs/catalogue). */
export const SUPPLY_DAYS = 30;

/** Under the subscription option: both are true (SHO-99 and the portal, SHO-73). */
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
 */
export const pricePerDay = (
  price: MoneyLike | null | undefined,
  days: number = SUPPLY_DAYS,
): string | null => {
  if (!price) return null;
  const total = minor(price);
  if (total === null || total <= 0 || days <= 0) return null;
  const perDay = Math.round(total / days);
  if (price.currencyCode === "GBP" && perDay < 100) return `${perDay}p a day`;
  return `${formatMoney({ amount: (perDay / 100).toFixed(2), currencyCode: price.currencyCode })} a day`;
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
 * How many 30-day supplies each delivery of a plan holds, so the shopper
 * never runs out: 1 for every 30 days, 2 for 60, 3 for 90. Always at least 1,
 * and 1 when the plan doesn't say. The plan sets the quantity; the shopper
 * doesn't choose it.
 */
export const supplyUnits = (
  options: readonly PlanOptionLike[] | null | undefined,
): number => {
  const days = planIntervalDays(options);
  return days ? Math.max(1, Math.round(days / SUPPLY_DAYS)) : 1;
};

const times = (money: MoneyLike, units: number): MoneyLike => {
  const value = minor(money);
  return value === null
    ? money
    : { amount: ((value * units) / 100).toFixed(2), currencyCode: money.currencyCode };
};

/** What one delivery of a purchase option holds and costs. */
export interface DeliveryQuote {
  /** 30-day supplies per delivery: the cart line's quantity. */
  readonly units: number;
  /** Days the delivery lasts, for the price per day. */
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
): DeliveryQuote => {
  const units = allocation ? supplyUnits(allocation.sellingPlan.options) : 1;
  const planPrice = allocation?.priceAdjustments[0]?.price ?? unitPrice;
  const price = times(planPrice, units);
  const oneTime = times(unitPrice, units);
  const saving =
    allocation && !isIntroductoryPlan(allocation.priceAdjustments)
      ? subscriptionSaving(oneTime, price)
      : null;
  const laterUnit = allocation?.priceAdjustments[1]?.price;
  const later = laterUnit ? times(laterUnit, units) : null;
  return { units, days: units * SUPPLY_DAYS, price, oneTime, saving, later };
};

/** "90-day supply (3 × 30-day packs)": what a multi-unit delivery holds. */
export const supplyLabel = (units: number): string | null =>
  units > 1
    ? `${units * SUPPLY_DAYS}-day supply (${units} × ${SUPPLY_DAYS}-day packs)`
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
): string => {
  const changes =
    later && (later.amount !== price.amount || later.currencyCode !== price.currencyCode);
  const each =
    units > 1 ? `each delivery of a ${units * SUPPLY_DAYS}-day supply` : "each delivery";
  const charge = changes
    ? `${formatMoney(price)} for an introductory period, then ${formatMoney(later)} for ${each} after that (checkout shows exactly when it changes), charged automatically`
    : `${formatMoney(price)} is charged for ${each}, automatically,`;
  return `${plan}: ${charge} until you cancel. You can skip, pause or cancel any time from your account.`;
};

/** For the sticky bars, which have room for one line beside their button. */
export const RENEWAL_SHORT = "Renews automatically until you cancel";
