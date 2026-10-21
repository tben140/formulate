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
  `Free UK delivery on subscriptions, and on orders over ${formatMoney(FREE_SHIPPING_THRESHOLD)}`;

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
 * The price per day of the 30-day supply, rounded to the nearest penny:
 * "45p a day", or "£1.20 a day". Null when the price isn't readable.
 */
export const pricePerDay = (price: MoneyLike | null | undefined): string | null => {
  if (!price) return null;
  const total = minor(price);
  if (total === null || total <= 0) return null;
  const perDay = Math.round(total / SUPPLY_DAYS);
  if (price.currencyCode === "GBP" && perDay < 100) return `${perDay}p a day`;
  return `${formatMoney({ amount: (perDay / 100).toFixed(2), currencyCode: price.currencyCode })} a day`;
};

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
 * `later` is the price after an introductory period (isIntroductoryPlan):
 * both prices are stated, and when the change happens is left to the
 * checkout summary, which shows it, rather than guessed here.
 */
export const renewalTerms = (
  price: MoneyLike,
  plan: string,
  later?: MoneyLike | null,
): string => {
  const changes =
    later && (later.amount !== price.amount || later.currencyCode !== price.currencyCode);
  const charge = changes
    ? `${formatMoney(price)} for an introductory period, then ${formatMoney(later)} for each delivery after that (checkout shows exactly when it changes), charged automatically`
    : `${formatMoney(price)} is charged for each delivery, automatically,`;
  return `${plan}: ${charge} until you cancel. You can skip, pause or cancel any time from your account.`;
};

/** For the sticky bars, which have room for one line beside their button. */
export const RENEWAL_SHORT = "Renews automatically until you cancel";
