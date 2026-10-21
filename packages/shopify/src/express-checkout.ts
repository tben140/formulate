import { formatMoney, type MoneyLike } from "./format-money";

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
  readonly sellingPlanAllocation?: {
    readonly sellingPlan: { readonly name: string };
  } | null;
  readonly cost: { readonly totalAmount: MoneyLike };
  readonly merchandise: { readonly product: { readonly title: string } };
}

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
    .map(
      (line) =>
        `${line.merchandise.product.title} (${line.sellingPlanAllocation!.sellingPlan.name}), ${formatMoney(line.cost.totalAmount)} a delivery`,
    )
    .join("; ");
  return `Subscriptions in this order renew automatically until you cancel: ${items}. You can skip, pause or cancel any time from your account.`;
};
