/**
 * Which payment icons the footer shows, from what Shopify says the store
 * accepts. Ids are Shopify's payment type names (Liquid's
 * `shop.enabled_payment_types`), which the icon set in
 * packages/tokens/src/payment.ts is keyed by.
 */
export type PaymentIconId =
  | "visa"
  | "master"
  | "american_express"
  | "apple_pay"
  | "google_pay"
  | "shopify_pay"
  | PayLaterId;

/**
 * Pay-later providers. The Storefront API reports cards and wallets only, so
 * these come from a shop metafield instead, `double_helix.pay_later` (a list
 * of these ids), set by hand once a provider is live at checkout. The theme
 * reads the same metafield, so all three surfaces switch together
 * (docs/integration-pay-later.md).
 */
export type PayLaterId = "klarna" | "clearpay";

/** Display order: cards, then wallets, then pay later. */
const ORDER: readonly PaymentIconId[] = [
  "visa",
  "master",
  "american_express",
  "apple_pay",
  "google_pay",
  "shopify_pay",
  "klarna",
  "clearpay",
];

const PLANNED: readonly PaymentIconId[] = ORDER.slice(0, 6);

/**
 * ⚠️ Shown while Shopify reports no payment methods at all, which is the case
 * until Shopify Payments is set up on this store. They're the methods Shopify
 * Payments brings in the UK. Once it's live, the store's real list replaces
 * these with no code change. The theme does the same with
 * `shop.enabled_payment_types`.
 */
export const PLANNED_PAYMENT_ICON_IDS = PLANNED;

const BY_SHOPIFY_NAME: Record<string, PaymentIconId> = {
  VISA: "visa",
  MASTERCARD: "master",
  AMERICAN_EXPRESS: "american_express",
  APPLE_PAY: "apple_pay",
  GOOGLE_PAY: "google_pay",
  ANDROID_PAY: "google_pay",
  SHOPIFY_PAY: "shopify_pay",
};

const PAY_LATER: ReadonlySet<string> = new Set<PayLaterId>(["klarna", "clearpay"]);

/**
 * The pay-later ids in the metafield's value, a JSON list of strings. Anything
 * else (a typo, an unknown provider, a value that isn't a list) is ignored
 * rather than failing the footer.
 */
export const payLaterIds = (value: string | null | undefined): readonly PayLaterId[] => {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (id): id is PayLaterId => typeof id === "string" && PAY_LATER.has(id),
  );
};

export const paymentIconIds = (
  settings:
    | {
        readonly acceptedCardBrands: readonly string[];
        readonly supportedDigitalWallets: readonly string[];
      }
    | null
    | undefined,
  payLater: readonly PayLaterId[] = [],
): readonly PaymentIconId[] => {
  const reported = [
    ...(settings?.acceptedCardBrands ?? []),
    ...(settings?.supportedDigitalWallets ?? []),
  ];
  if (reported.length === 0 && payLater.length === 0) return PLANNED_PAYMENT_ICON_IDS;
  // Methods with no icon (JCB, say) are left out. If that leaves none, no card
  // or wallet icons show: the planned set would claim methods the store
  // doesn't take.
  const accepted = new Set<PaymentIconId>([
    ...(reported.length === 0
      ? PLANNED
      : reported.flatMap((name) => BY_SHOPIFY_NAME[name] ?? [])),
    ...payLater,
  ]);
  return ORDER.filter((id) => accepted.has(id));
};
