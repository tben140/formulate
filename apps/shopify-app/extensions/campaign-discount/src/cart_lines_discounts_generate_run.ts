import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
  type ProductDiscountCandidate,
} from "../generated/api";

/**
 * A campaign's offer, charged at checkout (SHO-169, "step two" in
 * docs/campaigns.md). The discount's `$app:campaign-discount.config`
 * metafield holds the campaign's `offer_rules`, its collection and message,
 * written by `pnpm campaigns sync` so the price charged comes from the same
 * record the surfaces show. The discount's own start and end dates, set by
 * the same script, decide when it runs.
 *
 * Product discounts on the campaign's items:
 * - `percent`: N% off each eligible line;
 * - `tiered`: N% off every eligible line once their total reaches a tier;
 * - `bundle`: the cheapest `free` of every `buy` eligible items are free.
 *
 * Eligible: in the campaign's collection, one of `variantIds` when the
 * campaign covers only some variants, and the right kind of purchase for
 * `appliesTo`: one-time only (the default; subscriptions already save 15%),
 * everything, or subscriptions only (a subscribe-first offer: Recharge's
 * renewals don't pass through checkout, so it's the first delivery only).
 * The same rules as packages/shopify/src/campaign-offer.ts, which the
 * surfaces use to describe the offer; a config that doesn't parse gives no
 * discount.
 *
 * Limits, for signed-in shoppers (a guest has no customer to check):
 * - `maxUnits`: at most this many units of each product at the campaign
 *   price, per order (percent and tiered offers);
 * - `oncePerCustomer`: no discount for a customer tagged as having had it
 *   (`usedTags`, tagged after each order: docs/campaigns.md);
 * - `audienceTags`: only customers with one of these tags, e.g. lapsed
 *   subscribers for a win-back offer. Guests don't qualify.
 */

type AppliesTo = "one_time" | "all" | "subscriptions";

type Rules = (
  | { type: "percent"; percent: number }
  | { type: "tiered"; tiers: { minSubtotal: string; percent: number }[] }
  | { type: "bundle"; buy: number; free: number }
  | { type: "gift"; minSubtotal: string; variantId: string }
) & {
  appliesTo: AppliesTo;
  maxUnits: number | null;
  oncePerCustomer: boolean;
};

interface Config {
  rules: Rules;
  message: string;
  variantIds: string[];
  usedTags: string[];
  audienceTags: string[];
}

const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;

const strings = (value: unknown): string[] | null =>
  value === undefined
    ? []
    : Array.isArray(value) &&
        value.every((item) => typeof item === "string" && item.trim())
      ? (value as string[])
      : null;

/** The config, or null if any part of it is wrong: no discount beats a wrong one. */
export const parseConfig = (value: unknown): Config | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rules = raw.rules as Record<string, unknown> | undefined;
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  // Absent means every variant; present must be a list of ids. Anything else
  // is refused rather than read as "no restriction", which would widen it.
  if (
    raw.variantIds !== undefined &&
    !(
      Array.isArray(raw.variantIds) &&
      raw.variantIds.every((id) => typeof id === "string")
    )
  )
    return null;
  const variantIds = (raw.variantIds as string[] | undefined) ?? [];
  const usedTags = strings(raw.usedTags);
  const audienceTags = strings(raw.audienceTags);
  if (!rules || !message || !usedTags || !audienceTags) return null;

  // appliesTo, or the older oneTimeOnly flag (true unless false).
  const appliesTo: AppliesTo | null =
    rules.appliesTo === undefined
      ? rules.oneTimeOnly === false
        ? "all"
        : "one_time"
      : rules.appliesTo === "one_time" ||
          rules.appliesTo === "all" ||
          rules.appliesTo === "subscriptions"
        ? rules.appliesTo
        : null;
  if (!appliesTo) return null;
  if (rules.maxUnits !== undefined && !isCount(rules.maxUnits, 99)) return null;
  if (rules.oncePerCustomer !== undefined && typeof rules.oncePerCustomer !== "boolean")
    return null;
  // Once per customer needs the tag that marks it.
  if (rules.oncePerCustomer === true && usedTags.length === 0) return null;
  const limits = {
    appliesTo,
    maxUnits: (rules.maxUnits as number | undefined) ?? null,
    oncePerCustomer: rules.oncePerCustomer === true,
  };
  const config = { message, variantIds, usedTags, audienceTags };

  if (rules.type === "percent" && isPercent(rules.percent)) {
    return { rules: { type: "percent", percent: rules.percent, ...limits }, ...config };
  }
  if (rules.type === "bundle" && isCount(rules.buy, 10) && isCount(rules.free, 9)) {
    return rules.free < rules.buy
      ? {
          rules: { type: "bundle", buy: rules.buy, free: rules.free, ...limits },
          ...config,
        }
      : null;
  }
  // A free gift once the campaign's items reach a spend: one unit of
  // variantId, which the shopper adds (the surfaces say so).
  if (
    rules.type === "gift" &&
    typeof rules.minSubtotal === "string" &&
    AMOUNT.test(rules.minSubtotal) &&
    typeof rules.variantId === "string" &&
    /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(rules.variantId)
  ) {
    return {
      rules: {
        type: "gift",
        minSubtotal: rules.minSubtotal,
        variantId: rules.variantId,
        ...limits,
      },
      ...config,
    };
  }
  if (rules.type === "tiered" && Array.isArray(rules.tiers) && rules.tiers.length > 0) {
    const tiers: { minSubtotal: string; percent: number }[] = [];
    for (const tier of rules.tiers as Record<string, unknown>[]) {
      const { minSubtotal, percent } = tier ?? {};
      if (
        typeof minSubtotal !== "string" ||
        !AMOUNT.test(minSubtotal) ||
        !isPercent(percent)
      )
        return null;
      const previous = tiers.at(-1);
      if (
        previous &&
        (Number(minSubtotal) <= Number(previous.minSubtotal) ||
          percent <= previous.percent)
      )
        return null;
      tiers.push({ minSubtotal, percent });
    }
    return { rules: { type: "tiered", tiers, ...limits }, ...config };
  }
  return null;
};

/** Pence, so thresholds compare exactly. */
const pence = (amount: string | number): number => Math.round(Number(amount) * 100);

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }
  const config = parseConfig(input.discount.config?.jsonValue);
  if (!config) return { operations: [] };
  const { rules, message, variantIds, audienceTags } = config;

  const customer = input.cart.buyerIdentity?.customer;
  if (rules.oncePerCustomer && customer?.usedCampaign) return { operations: [] };
  if (audienceTags.length > 0 && !customer?.inAudience) return { operations: [] };

  const giftId = rules.type === "gift" ? rules.variantId : null;
  const eligible = input.cart.lines.filter((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return false;
    // The gift itself never counts towards its own threshold.
    if (line.merchandise.id === giftId) return false;
    if (!line.merchandise.inCampaign) return false;
    if (variantIds.length > 0 && !variantIds.includes(line.merchandise.id)) return false;
    const subscription = Boolean(
      line.sellingPlanAllocation?.sellingPlan.recurringDeliveries,
    );
    return (
      rules.appliesTo === "all" || (rules.appliesTo === "subscriptions") === subscription
    );
  });
  if (eligible.length === 0) return { operations: [] };

  // At most maxUnits of each product, across its lines in cart order.
  const left = new Map<string, number>();
  const capped = (line: (typeof eligible)[number]): number => {
    if (rules.maxUnits === null || line.merchandise.__typename !== "ProductVariant")
      return line.quantity;
    const product = line.merchandise.product.id;
    const remaining = left.get(product) ?? rules.maxUnits;
    const quantity = Math.min(line.quantity, remaining);
    left.set(product, remaining - quantity);
    return quantity;
  };

  let candidates: ProductDiscountCandidate[] = [];

  if (rules.type === "gift") {
    const gift = input.cart.lines.find(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        line.merchandise.id === rules.variantId,
    );
    const total = eligible.reduce(
      (sum, line) => sum + pence(line.cost.amountPerQuantity.amount) * line.quantity,
      0,
    );
    const rate = Number(input.presentmentCurrencyRate) || 1;
    if (!gift || total < pence(Number(rules.minSubtotal) * rate))
      return { operations: [] };
    candidates = [
      {
        message,
        targets: [{ cartLine: { id: gift.id, quantity: 1 } }],
        value: { percentage: { value: 100 } },
      },
    ];
  } else if (rules.type === "percent" || rules.type === "tiered") {
    let percent: number | undefined;
    if (rules.type === "percent") {
      percent = rules.percent;
    } else {
      const total = eligible.reduce(
        (sum, line) => sum + pence(line.cost.amountPerQuantity.amount) * line.quantity,
        0,
      );
      // Thresholds are in the shop's currency; the cart may be in another.
      const rate = Number(input.presentmentCurrencyRate) || 1;
      percent = rules.tiers
        .filter((tier) => pence(Number(tier.minSubtotal) * rate) <= total)
        .at(-1)?.percent;
    }
    if (percent === undefined) return { operations: [] };
    const targets = eligible.flatMap((line) => {
      const quantity = capped(line);
      if (quantity === 0) return [];
      // A whole line needs no quantity; a capped one says how many.
      return [
        {
          cartLine:
            quantity === line.quantity ? { id: line.id } : { id: line.id, quantity },
        },
      ];
    });
    candidates = [{ message, targets, value: { percentage: { value: percent } } }];
  } else {
    // Every unit, cheapest first; the cheapest `free` of each `buy` go free.
    const units = eligible
      .flatMap((line) =>
        Array.from({ length: line.quantity }, () => ({
          id: line.id,
          price: pence(line.cost.amountPerQuantity.amount),
        })),
      )
      .sort((a, b) => a.price - b.price);
    const freeCount = Math.floor(units.length / rules.buy) * rules.free;
    if (freeCount === 0) return { operations: [] };
    const freePerLine = new Map<string, number>();
    for (const unit of units.slice(0, freeCount)) {
      freePerLine.set(unit.id, (freePerLine.get(unit.id) ?? 0) + 1);
    }
    candidates = [
      {
        message,
        targets: [...freePerLine].map(([id, quantity]) => ({
          cartLine: { id, quantity },
        })),
        value: { percentage: { value: 100 } },
      },
    ];
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
