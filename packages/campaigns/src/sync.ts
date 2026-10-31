import { parseOfferRules, type OfferRules } from "@formulate/shopify";

import type { CampaignEntry, CollectionInfo, DiscountInfo, ProductInfo } from "./types";

/**
 * The campaign discount Function's config (apps/shopify-app/extensions/
 * campaign-discount), worked out from the campaign record: what
 * `campaigns sync` writes and `campaigns check` expects.
 */
export interface DiscountConfig {
  /** Which campaign this discount belongs to; the Function ignores it. */
  readonly campaign: string;
  readonly collectionIds: readonly string[];
  /** Empty unless some product is narrowed to certain variants. */
  readonly variantIds: readonly string[];
  /** Shown at checkout beside the discount. */
  readonly message: string;
  /** The rules as the Function reads them: thresholds as plain amounts. */
  readonly rules: FunctionRules;
}

export type FunctionRules =
  | { readonly type: "percent"; readonly percent: number; readonly oneTimeOnly: boolean }
  | {
      readonly type: "tiered";
      readonly tiers: readonly {
        readonly minSubtotal: string;
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

/** The shared rules in the Function's shape (it has no currencies: GBP only). */
export const functionRules = (rules: OfferRules): FunctionRules =>
  rules.type === "tiered"
    ? {
        type: "tiered",
        tiers: rules.tiers.map((tier) => ({
          minSubtotal: tier.minSubtotal.amount,
          percent: tier.percent,
        })),
        oneTimeOnly: rules.oneTimeOnly,
      }
    : rules;

/**
 * The config for a campaign, or the reason there can't be one.
 *
 * `variantIds`: the Function has one list for the whole discount, so when
 * any product is narrowed to some variants, every covered variant of every
 * product is listed (all of an un-narrowed product's, only the named ones of
 * a narrowed product's). With no narrowing it's empty: the collection alone.
 */
export const discountConfig = (
  entry: CampaignEntry,
  collection: CollectionInfo | null,
  products: readonly ProductInfo[],
): { readonly config: DiscountConfig } | { readonly error: string } => {
  const rules = parseOfferRules(entry.fields.offer_rules);
  if (!rules) return { error: "offer_rules is missing or doesn't parse" };
  if (
    rules.type === "tiered" &&
    rules.tiers.some((tier) => tier.minSubtotal.currencyCode !== "GBP")
  )
    return { error: "the discount Function prices in GBP only" };
  if (!collection) return { error: "the campaign has no collection" };
  const badge = entry.fields.badge?.trim();
  if (!badge) return { error: "the campaign has no badge" };

  const inCampaign = products.filter((product) => product.campaignId === entry.id);
  const narrowed = inCampaign.some((product) =>
    product.variants.some((variant) => variant.campaignId !== null),
  );
  const variantIds = narrowed
    ? inCampaign.flatMap((product) => {
        const own = product.variants.filter((variant) => variant.campaignId !== null);
        return (
          own.length > 0 ? own.filter((v) => v.campaignId === entry.id) : product.variants
        ).map((variant) => variant.id);
      })
    : [];

  return {
    config: {
      campaign: entry.handle,
      collectionIds: [collection.id],
      variantIds,
      message: badge,
      rules: functionRules(rules),
    },
  };
};

/** The campaign's own discounts: the Function's (by config) or titled after it. */
export const campaignDiscounts = (
  entry: CampaignEntry,
  discounts: readonly DiscountInfo[],
): DiscountInfo[] => {
  const title = entry.fields.title?.trim() ?? "";
  return discounts.filter((discount) =>
    discount.kind === "app"
      ? (discount.config as { campaign?: unknown } | null)?.campaign === entry.handle
      : title !== "" && discount.title.startsWith(title),
  );
};

/** Whether two configs say the same thing, whatever their key order. */
export const sameConfig = (a: unknown, b: unknown): boolean => {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .filter(([, v]) => v !== undefined)
              .sort(([x], [y]) => x.localeCompare(y))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
};
