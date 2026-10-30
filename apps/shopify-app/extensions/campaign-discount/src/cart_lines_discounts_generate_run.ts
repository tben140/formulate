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
 * campaign covers only some variants, and not a subscription when the offer
 * is one-time only (the default; subscriptions already save 15%). The same
 * rules as packages/shopify/src/campaign-offer.ts, which the surfaces use to
 * describe the offer; a config that doesn't parse gives no discount.
 */

type Rules =
  | { type: "percent"; percent: number }
  | { type: "tiered"; tiers: { minSubtotal: string; percent: number }[] }
  | { type: "bundle"; buy: number; free: number };

interface Config {
  rules: Rules & { oneTimeOnly?: boolean };
  message: string;
  variantIds: string[];
}

const isPercent = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 90;

const isCount = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= max;

const AMOUNT = /^\d{1,6}(\.\d{1,2})?$/;

/** The config, or null if any part of it is wrong: no discount beats a wrong one. */
export const parseConfig = (value: unknown): Config | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const rules = raw.rules as Record<string, unknown> | undefined;
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const variantIds = Array.isArray(raw.variantIds)
    ? raw.variantIds.filter((id): id is string => typeof id === "string")
    : [];
  if (!rules || !message) return null;
  const oneTimeOnly = rules.oneTimeOnly !== false;

  if (rules.type === "percent" && isPercent(rules.percent)) {
    return {
      rules: { type: "percent", percent: rules.percent, oneTimeOnly },
      message,
      variantIds,
    };
  }
  if (rules.type === "bundle" && isCount(rules.buy, 10) && isCount(rules.free, 9)) {
    return rules.free < rules.buy
      ? {
          rules: { type: "bundle", buy: rules.buy, free: rules.free, oneTimeOnly },
          message,
          variantIds,
        }
      : null;
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
    return { rules: { type: "tiered", tiers, oneTimeOnly }, message, variantIds };
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
  const { rules, message, variantIds } = config;

  const eligible = input.cart.lines.filter((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return false;
    if (!line.merchandise.product.inCampaign) return false;
    if (variantIds.length > 0 && !variantIds.includes(line.merchandise.id)) return false;
    return !(
      rules.oneTimeOnly !== false &&
      line.sellingPlanAllocation?.sellingPlan.recurringDeliveries
    );
  });
  if (eligible.length === 0) return { operations: [] };

  let candidates: ProductDiscountCandidate[] = [];

  if (rules.type === "percent" || rules.type === "tiered") {
    let percent: number | undefined;
    if (rules.type === "percent") {
      percent = rules.percent;
    } else {
      const total = eligible.reduce(
        (sum, line) => sum + pence(line.cost.amountPerQuantity.amount) * line.quantity,
        0,
      );
      percent = rules.tiers
        .filter((tier) => pence(tier.minSubtotal) <= total)
        .at(-1)?.percent;
    }
    if (percent === undefined) return { operations: [] };
    candidates = [
      {
        message,
        targets: eligible.map((line) => ({ cartLine: { id: line.id } })),
        value: { percentage: { value: percent } },
      },
    ];
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
