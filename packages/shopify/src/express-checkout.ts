import { formatMoney, type MoneyLike } from "./format-money";
import { isIntroductoryPlan } from "./subscribe-and-save";

/**
 * Express checkout (Shop Pay, Apple Pay): the rules shared by web, the app and
 * (restated in Liquid) the theme.
 *
 * ⚠️ A one-tap wallet purchase can skip Shopify's checkout page, where the
 * subscription terms would otherwise be shown. So:
 *
 * - **Product pages offer it for one-time purchases only.** The buttons there
 *   can't carry a selling plan (Checkout Kit takes a variant and quantity; web's
 *   Shop Pay button a cart permalink), so a subscription can't be bought that
 *   way anyway.
 * - **Carts state the renewal terms above every way to pay** whenever they
 *   hold a subscription: what renews, at what price, until cancelled, and how
 *   to cancel. California's Automatic Renewal Law requires them before
 *   purchase; the UK's DMCC subscription rules will from 2027 (SHO-179).
 */

/** What `cartRenewalTerms` reads from a cart line (CartFields). */
export interface RenewalLine {
  readonly quantity: number;
  readonly sellingPlanAllocation?: {
    readonly sellingPlan: { readonly name: string };
    /** Per unit; a second, different one is an introductory plan's later price. */
    readonly priceAdjustments?: readonly { readonly price: MoneyLike }[];
  } | null;
  readonly cost: { readonly totalAmount: MoneyLike };
  readonly merchandise: { readonly product: { readonly title: string } };
}

const times = (money: MoneyLike, quantity: number): MoneyLike => ({
  amount: ((Math.round(Number(money.amount) * 100) * quantity) / 100).toFixed(2),
  currencyCode: money.currencyCode,
});

/** Whether a product page should show express checkout: one-time only. */
export const expressCheckoutOnProduct = (planId: string): boolean => !planId;

/**
 * The renewal terms for a cart, or null when it holds no subscription:
 * "Subscriptions in this order renew automatically until you cancel: Daily
 * Multivitamin (90 day subscription with 15% discount), £40.68 a delivery.
 * You can skip, pause or cancel any time from your account."
 */
export const cartRenewalTerms = (lines: readonly RenewalLine[]): string | null => {
  const subscriptions = lines.filter((line) => line.sellingPlanAllocation);
  if (subscriptions.length === 0) return null;
  const items = subscriptions
    .map((line) => {
      const plan = line.sellingPlanAllocation!;
      const adjustments = plan.priceAdjustments ?? [];
      // An introductory plan: the cart's price is only the first one, so the
      // later price is stated too, and when it starts is left to checkout.
      const price = isIntroductoryPlan(adjustments)
        ? `${formatMoney(line.cost.totalAmount)} for an introductory period, then ${formatMoney(times(adjustments[1]!.price, line.quantity))} a delivery (checkout shows exactly when it changes)`
        : `${formatMoney(line.cost.totalAmount)} a delivery`;
      return `${line.merchandise.product.title} (${plan.sellingPlan.name}), ${price}`;
    })
    .join("; ");
  return `Subscriptions in this order renew automatically until you cancel: ${items}. You can skip, pause or cancel any time from your account.`;
};
