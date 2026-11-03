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
 * Who and what it reaches, on every type (all optional in the JSON):
 * - `appliesTo`: `"one_time"` (the default: subscriptions are already 15% off,
 *   so the campaign doesn't stack on them; subscribers get the perk instead),
 *   `"all"`, or `"subscriptions"`: a subscribe-first offer, on the first
 *   delivery only (Recharge's renewals don't pass through checkout). The older
 *   `"oneTimeOnly": false` still means `"all"`, and `oneTimeOnly` below is
 *   kept for the code that reads it.
 * - `maxUnits`: at most this many of each product at the campaign price per
 *   order.
 * - `oncePerCustomer`: once per signed-in customer (they're tagged after
 *   ordering; guests can't be told apart).
 * - `audienceTags`: only signed-in customers with one of these Shopify tags,
 *   e.g. a win-back offer for lapsed subscribers. Such an offer is never
 *   advertised to everyone: it goes with the email-link-only audience.
 *
 * The discount Function (apps/shopify-app/extensions/campaign-discount)
 * enforces all of these at checkout; the surfaces only describe them.
 */
export type AppliesTo = "one_time" | "all" | "subscriptions";

interface OfferReach {
  readonly appliesTo: AppliesTo;
  /** appliesTo is "one_time". */
  readonly oneTimeOnly: boolean;
  readonly maxUnits: number | null;
  readonly oncePerCustomer: boolean;
  readonly audienceTags: readonly string[];
}

export type OfferRules = OfferReach &
  (
    | {
        readonly type: "percent";
        readonly percent: number;
      }
    | {
        readonly type: "tiered";
        /** Ascending by `minSubtotal`; at least one. */
        readonly tiers: readonly {
          readonly minSubtotal: MoneyLike;
          readonly percent: number;
        }[];
      }
    | {
        readonly type: "bundle";
        readonly buy: number;
        readonly free: number;
      }
    | {
        /** One `variantId` free once the campaign's items reach `minSubtotal`. */
        readonly type: "gift";
        readonly minSubtotal: MoneyLike;
        readonly variantId: string;
        /** What the gift is called in the cart, e.g. "shaker"; "gift" without it. */
        readonly giftLabel: string;
      }
  );

const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;
/** A Shopify customer tag, as the campaigns CLI writes them. */
const TAG = /^[A-Za-z0-9][\w :-]{0,39}$/;

/** The reach fields, or null when any is present but wrong. */
const parseReach = (raw: Record<string, unknown>): OfferReach | null => {
  const appliesTo: AppliesTo | null =
    raw.appliesTo === undefined
      ? raw.oneTimeOnly === false
        ? "all"
        : "one_time"
      : raw.appliesTo === "one_time" ||
          raw.appliesTo === "all" ||
          raw.appliesTo === "subscriptions"
        ? raw.appliesTo
        : null;
  if (!appliesTo) return null;
  if (raw.maxUnits !== undefined && !isCount(raw.maxUnits, 99)) return null;
  if (raw.oncePerCustomer !== undefined && typeof raw.oncePerCustomer !== "boolean")
    return null;
  const tags = raw.audienceTags ?? [];
  if (
    !Array.isArray(tags) ||
    tags.length > 10 ||
    !tags.every((tag) => typeof tag === "string" && TAG.test(tag))
  )
    return null;
  return {
    appliesTo,
    oneTimeOnly: appliesTo === "one_time",
    maxUnits: (raw.maxUnits as number | undefined) ?? null,
    oncePerCustomer: raw.oncePerCustomer === true,
    audienceTags: tags as string[],
  };
};
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
  const reach = parseReach(raw);
  if (!reach) return null;
  switch (raw.type) {
    case "percent":
      return isPercent(raw.percent)
        ? { type: "percent", percent: raw.percent, ...reach }
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
      return { type: "tiered", tiers, ...reach };
    }
    case "bundle":
      return isCount(raw.buy, 10) && isCount(raw.free, 9) && raw.free < raw.buy
        ? { type: "bundle", buy: raw.buy, free: raw.free, ...reach }
        : null;
    case "gift": {
      const currencyCode = raw.currencyCode ?? "GBP";
      const label = raw.giftLabel ?? "gift";
      return typeof raw.minSubtotal === "string" &&
        AMOUNT.test(raw.minSubtotal) &&
        typeof currencyCode === "string" &&
        CURRENCY.test(currencyCode) &&
        typeof raw.variantId === "string" &&
        /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(raw.variantId) &&
        typeof label === "string" &&
        /^[\w' -]{1,30}$/.test(label)
        ? {
            type: "gift",
            minSubtotal: { amount: raw.minSubtotal, currencyCode },
            variantId: raw.variantId,
            giftLabel: label,
            ...reach,
          }
        : null;
    }
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
 * (tiered, bundle), or doesn't apply to this kind of purchase (`appliesTo`).
 * For a subscription, `price` is the subscription's own price: a
 * subscribe-first offer comes off that.
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
  if (subscription ? rules.appliesTo === "one_time" : rules.appliesTo === "subscriptions")
    return null;
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

  if (rules.type === "gift") {
    const currency = rules.minSubtotal.currencyCode;
    if (eligible.some((line) => line.subtotal.currencyCode !== currency)) return null;
    const total = eligible.reduce((sum, line) => sum + (toMinor(line.subtotal) ?? 0), 0);
    const threshold = toMinor(rules.minSubtotal) ?? 0;
    return total >= threshold
      ? {
          next: null,
          reached: `Your free ${rules.giftLabel} is unlocked: add it to your basket`,
        }
      : {
          next: `Spend ${formatMoney(fromMinor(threshold - total, currency))} more on ${badge} items for a free ${rules.giftLabel}`,
          reached: null,
        };
  }

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
    /** The variant: a gift offer's own variant never counts towards it. */
    readonly id?: string;
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
        reaches(campaign.rules, Boolean(line.sellingPlanAllocation)) &&
        !(
          campaign.rules?.type === "gift" &&
          line.merchandise.id === campaign.rules.variantId
        ),
    };
  });

/** Whether the offer reaches a one-time purchase or a subscription. */
const reaches = (rules: OfferRules | null, subscription: boolean): boolean => {
  const appliesTo = rules?.appliesTo ?? "one_time";
  return appliesTo === "all" || (appliesTo === "subscriptions") === subscription;
};

/**
 * The limits as shoppers read them, or null when there are none: "Black
 * Friday price on up to 2 of each product, once per customer". Shown beside
 * the offer, so a capped cart isn't a surprise at checkout.
 */
export const offerLimits = (rules: OfferRules | null, badge: string): string | null => {
  if (!rules) return null;
  const parts = [
    rules.maxUnits !== null
      ? `${badge} price on up to ${rules.maxUnits} of each product`
      : null,
    rules.oncePerCustomer ? "once per customer (signed in)" : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

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
