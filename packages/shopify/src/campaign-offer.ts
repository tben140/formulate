import { formatMoney, type MoneyLike } from "./format-money";

/**
 * A campaign's offer as data (the campaign's `offer_rules` field), so the
 * surfaces can show the price before checkout and the discount Function can
 * charge it, from the same record. See docs/campaigns.md, "Offer rules".
 *
 * The `offer` field stays: it's the wording shoppers read. `campaigns check`
 * (scripts) fails when the two disagree.
 *
 * - `percent`: N% off each eligible item.
 * - `tiered`: N% off eligible items once they add up to a threshold; the
 *   highest threshold reached wins.
 * - `bundle`: buy `buy` eligible items, the cheapest `free` of them are free,
 *   repeated ("3 for 2" is buy 3, free 1).
 *
 * `oneTimeOnly` (the default): subscriptions are already 15% off, so the
 * campaign doesn't stack on them. Subscribers get the perk instead.
 */
export type OfferRules =
  | {
      readonly type: "percent";
      readonly percent: number;
      readonly oneTimeOnly: boolean;
    }
  | {
      readonly type: "tiered";
      /** Ascending by `minSubtotal`; at least one. */
      readonly tiers: readonly {
        readonly minSubtotal: MoneyLike;
        readonly percent: number;
      }[];
      readonly oneTimeOnly: boolean;
    }
  | {
      readonly type: "bundle";
      readonly buy: number;
      readonly free: number;
      readonly oneTimeOnly: boolean;
    };

const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;

/**
 * The rules from the field's JSON, or null when absent or not valid. Invalid
 * rules show nothing extra (the `offer` text still shows): a wrong price on
 * the page is worse than none.
 */
export const parseOfferRules = (json: string | null | undefined): OfferRules | null => {
  if (!json) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const oneTimeOnly = raw.oneTimeOnly !== false;
  switch (raw.type) {
    case "percent":
      return isPercent(raw.percent)
        ? { type: "percent", percent: raw.percent, oneTimeOnly }
        : null;
    case "tiered": {
      const currencyCode = raw.currencyCode ?? "GBP";
      if (typeof currencyCode !== "string" || !CURRENCY.test(currencyCode)) return null;
      if (!Array.isArray(raw.tiers) || raw.tiers.length < 1 || raw.tiers.length > 5)
        return null;
      const tiers: { minSubtotal: MoneyLike; percent: number }[] = [];
      for (const tier of raw.tiers as unknown[]) {
        const { minSubtotal, percent } = (tier ?? {}) as Record<string, unknown>;
        if (typeof minSubtotal !== "string" || !AMOUNT.test(minSubtotal)) return null;
        if (!isPercent(percent)) return null;
        const previous = tiers.at(-1);
        // Strictly ascending, and each tier worth more than the one before.
        if (
          previous &&
          (Number(minSubtotal) <= Number(previous.minSubtotal.amount) ||
            percent <= previous.percent)
        )
          return null;
        tiers.push({ minSubtotal: { amount: minSubtotal, currencyCode }, percent });
      }
      return { type: "tiered", tiers, oneTimeOnly };
    }
    case "bundle":
      return isCount(raw.buy, 10) && isCount(raw.free, 9) && raw.free < raw.buy
        ? { type: "bundle", buy: raw.buy, free: raw.free, oneTimeOnly }
        : null;
    default:
      return null;
  }
};

/** How many minor units the currency has: 2 for GBP. */
const digits = (currencyCode: string): number =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits ?? 2;

const toMinor = (money: MoneyLike): number | null => {
  const value = Number(money.amount);
  return Number.isFinite(value)
    ? Math.round(value * 10 ** digits(money.currencyCode))
    : null;
};

const fromMinor = (minor: number, currencyCode: string): MoneyLike => {
  const places = digits(currencyCode);
  return { amount: (minor / 10 ** places).toFixed(places), currencyCode };
};

/**
 * The price a shopper pays for one item under a `percent` offer, shown before
 * checkout beside the normal price. Null when the offer has no single price
 * (tiered, bundle), or doesn't apply (a subscription under `oneTimeOnly`).
 *
 * Rounded to the penny the way Shopify rounds a percentage off one item. A
 * line of several can differ by a penny at checkout, which then shows the
 * exact total.
 */
export const campaignUnitPrice = (
  rules: OfferRules | null,
  price: MoneyLike,
  { subscription = false }: { readonly subscription?: boolean } = {},
): MoneyLike | null => {
  if (rules?.type !== "percent") return null;
  if (subscription && rules.oneTimeOnly) return null;
  const minor = toMinor(price);
  if (minor === null || minor <= 0) return null;
  const off = Math.round((minor * rules.percent) / 100);
  return fromMinor(minor - off, price.currencyCode);
};

/** A cart line, as far as the offer is concerned. */
export interface OfferLine {
  /** The line's cost before any discount (price × quantity). */
  readonly subtotal: MoneyLike;
  readonly quantity: number;
  /** In the campaign, and one-time when the offer is one-time only. */
  readonly eligible: boolean;
}

/**
 * What the cart says about a tiered or bundle offer: how far to the next step,
 * and what's already reached. Null for a percent offer (the line prices say
 * it) or when nothing in the cart is in the campaign.
 *
 * - `next`: "Spend £12.00 more on Black Friday items for 25% off".
 * - `reached`: "15% off your Black Friday items at checkout".
 *
 * Shopify works out the discount itself at checkout; this only describes it.
 */
export const campaignCartProgress = (
  rules: OfferRules | null,
  lines: readonly OfferLine[],
  badge: string,
): { readonly next: string | null; readonly reached: string | null } | null => {
  if (!rules || rules.type === "percent") return null;
  const eligible = lines.filter((line) => line.eligible && line.quantity > 0);
  if (eligible.length === 0) return null;

  if (rules.type === "bundle") {
    const units = eligible.reduce((sum, line) => sum + line.quantity, 0);
    const sets = Math.floor(units / rules.buy);
    const missing = rules.buy - (units % rules.buy);
    const item = (count: number) => `${count} ${count === 1 ? "item" : "items"}`;
    return {
      next: `Add ${item(missing)} from ${badge} for ${rules.free} more free`,
      reached: sets > 0 ? `${item(sets * rules.free)} free at checkout` : null,
    };
  }

  const currencyCode = rules.tiers[0]!.minSubtotal.currencyCode;
  if (eligible.some((line) => line.subtotal.currencyCode !== currencyCode)) return null;
  const total = eligible.reduce((sum, line) => sum + (toMinor(line.subtotal) ?? 0), 0);
  const reached = rules.tiers
    .filter((tier) => (toMinor(tier.minSubtotal) ?? 0) <= total)
    .at(-1);
  const next = rules.tiers.find((tier) => (toMinor(tier.minSubtotal) ?? 0) > total);
  return {
    next: next
      ? `Spend ${formatMoney(fromMinor((toMinor(next.minSubtotal) ?? 0) - total, currencyCode))} more on ${badge} items for ${next.percent}% off`
      : null,
    reached: reached ? `${reached.percent}% off your ${badge} items at checkout` : null,
  };
};

/** A cart line as CartFields selects it, as far as campaigns go. */
interface CampaignCartLine {
  readonly quantity: number;
  readonly merchandise: {
    readonly price: MoneyLike;
    readonly product: {
      readonly campaign?: {
        readonly reference?: { readonly handle?: string } | null;
      } | null;
    };
  };
  readonly sellingPlanAllocation?: unknown;
}

/**
 * Cart lines as the offer sees them: in this campaign (by the product's field,
 * as the discount Function does) and, for a one-time-only offer, not a
 * subscription.
 */
export const offerLines = (
  campaign: { readonly handle: string; readonly rules: OfferRules | null },
  lines: readonly CampaignCartLine[],
): OfferLine[] =>
  lines.map((line) => {
    const minor = toMinor(line.merchandise.price) ?? 0;
    return {
      quantity: line.quantity,
      subtotal: fromMinor(minor * line.quantity, line.merchandise.price.currencyCode),
      eligible:
        line.merchandise.product.campaign?.reference?.handle === campaign.handle &&
        !(campaign.rules?.oneTimeOnly !== false && line.sellingPlanAllocation),
    };
  });

/** Every percentage the rules can give, for checking the wording against. */
export const offerPercents = (rules: OfferRules): number[] =>
  rules.type === "percent"
    ? [rules.percent]
    : rules.type === "tiered"
      ? rules.tiers.map((tier) => tier.percent)
      : [];

/**
 * "Ends in 5h 12m" in the last day of a campaign, else null (the date label
 * says it then). Counts down to the real end time, so it can't drift from
 * the offer, as the Digital Markets, Competition and Consumers Act requires.
 */
export const campaignCountdown = (endsAt: Date, now: Date): string | null => {
  const left = endsAt.getTime() - now.getTime();
  if (left <= 0 || left > 24 * 60 * 60 * 1000) return null;
  const minutes = Math.floor(left / 60_000);
  if (minutes < 1) return "Ends in under a minute";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `Ends in ${hours}h ${minutes % 60}m` : `Ends in ${minutes}m`;
};
