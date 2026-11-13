import { formatMoney, type MoneyLike } from "./format-money";

/**
 * The order value at which UK standard delivery becomes free.
 *
 * ⚠️ A copy, not a lookup. The real rule is a price condition on the "Free
 * standard delivery" rate in the store's General delivery profile, and the
 * Storefront API has no way to read it. Change the rate and this together, and
 * the theme's copy in sections/cart-drawer.liquid as well.
 *
 * Money rather than a bare number, because a number with no currency is the
 * bug that ships: `40` compared against a cart in euros would be quietly wrong.
 */
export const FREE_SHIPPING_THRESHOLD: MoneyLike = {
  amount: "40.00",
  currencyCode: "GBP",
};

export type FreeShippingProgress =
  | {
      readonly kind: "away";
      readonly remaining: MoneyLike;
      /** 0 to 1, for the bar. Decoration only: the message carries the meaning. */
      readonly fraction: number;
    }
  | { readonly kind: "unlocked"; readonly fraction: 1 };

/** How many minor units the currency has: 2 for GBP, 0 for JPY. */
const fractionDigits = (currencyCode: string): number =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits ?? 2;

/**
 * Integer minor units, so £39.99 + 1p is exactly £40.00 rather than
 * 39.99000000000001. The threshold is an equality test at its edge, and floats
 * get edges wrong.
 */
const toMinor = (amount: string, digits: number): number | null => {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 10 ** digits) : null;
};

/**
 * How close a cart is to free delivery.
 *
 * Pass the cart **subtotal**, never its total. The total includes delivery, so
 * a free-delivery threshold measured against it is circular.
 *
 * The subtotal is taken as each surface already shows it: after line-level
 * discounts (subscription savings included), before cart-level discount codes.
 * No surface accepts a code before checkout, so in practice nothing is left
 * out. A code entered *at* checkout can take an order back under the
 * threshold, and there Shopify's own rate rules decide, not this.
 *
 * Returns null when the subtotal is in a different currency from the
 * threshold, or unreadable. Showing nothing is correct then; converting would
 * mean guessing at a rate the store has not set.
 */
export const freeShippingProgress = (
  subtotal: MoneyLike,
  threshold: MoneyLike = FREE_SHIPPING_THRESHOLD,
): FreeShippingProgress | null => {
  if (subtotal.currencyCode !== threshold.currencyCode) return null;

  const digits = fractionDigits(threshold.currencyCode);
  const have = toMinor(subtotal.amount, digits);
  const need = toMinor(threshold.amount, digits);
  if (have === null || need === null || need <= 0) return null;

  if (have >= need) return { kind: "unlocked", fraction: 1 };

  return {
    kind: "away",
    remaining: {
      amount: ((need - have) / 10 ** digits).toFixed(digits),
      currencyCode: threshold.currencyCode,
    },
    fraction: Math.max(0, have / need),
  };
};

/** The words a shopper reads, and a screen reader announces. */
export const freeShippingMessage = (progress: FreeShippingProgress): string =>
  progress.kind === "unlocked"
    ? "You've unlocked free standard delivery"
    : `You're ${formatMoney(progress.remaining)} away from free standard delivery`;
