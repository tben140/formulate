/**
 * Which payment icons the footer shows, from what Shopify says the store
 * accepts. Ids are Shopify's payment type names (Liquid's
 * `shop.enabled_payment_types`), which the icon set in
 * packages/tokens/src/payment.ts is keyed by.
 */
export type PaymentIconId =
  "visa" | "master" | "american_express" | "apple_pay" | "google_pay" | "shopify_pay";

/** Display order: cards, then wallets. */
const ORDER: readonly PaymentIconId[] = [
  "visa",
  "master",
  "american_express",
  "apple_pay",
  "google_pay",
  "shopify_pay",
];

/**
 * ⚠️ Shown while Shopify reports no payment methods at all, which is the case
 * until Shopify Payments is set up on this store. They're the methods Shopify
 * Payments brings in the UK. Once it's live, the store's real list replaces
 * these with no code change. The theme does the same with
 * `shop.enabled_payment_types`.
 */
export const PLANNED_PAYMENT_ICON_IDS = ORDER;

const BY_SHOPIFY_NAME: Record<string, PaymentIconId> = {
  VISA: "visa",
  MASTERCARD: "master",
  AMERICAN_EXPRESS: "american_express",
  APPLE_PAY: "apple_pay",
  GOOGLE_PAY: "google_pay",
  ANDROID_PAY: "google_pay",
  SHOPIFY_PAY: "shopify_pay",
};

export const paymentIconIds = (
  settings:
    | {
        readonly acceptedCardBrands: readonly string[];
        readonly supportedDigitalWallets: readonly string[];
      }
    | null
    | undefined,
): readonly PaymentIconId[] => {
  const accepted = new Set(
    [
      ...(settings?.acceptedCardBrands ?? []),
      ...(settings?.supportedDigitalWallets ?? []),
    ].flatMap((name) => BY_SHOPIFY_NAME[name] ?? []),
  );
  if (accepted.size === 0) return PLANNED_PAYMENT_ICON_IDS;
  return ORDER.filter((id) => accepted.has(id));
};
