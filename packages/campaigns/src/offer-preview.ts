import { parseOfferRules } from "@formulate/shopify";

import { campaignOf } from "./campaign-node";
import { DEFAULT_MIN_MARGIN, marginRows, type MarginRow } from "./margins";
import { campaignTerms, offerInWords } from "./terms";
import type { CampaignEntry, Snapshot } from "./types";

/**
 * What an offer would mean before it's saved (SHO-206): the calendar's offer
 * editor shows this as the rules are edited, beside the saved offer. The same
 * parser as the discount Function, so a config it would ignore is refused.
 */
export type OfferPreview =
  | { readonly valid: false; readonly error: string }
  | {
      readonly valid: true;
      readonly words: string;
      readonly terms: string;
      /** The lowest margins first, at most five. */
      readonly lowest: readonly MarginRow[];
      readonly underFloor: number;
      readonly withoutCost: number;
      readonly variants: number;
      readonly minMargin: number;
    };

export const previewOffer = (
  data: Pick<Snapshot, "entry" | "products" | "collection">,
  json: string,
  minMargin: number = DEFAULT_MIN_MARGIN,
): OfferPreview => {
  const rules = parseOfferRules(json);
  if (!rules)
    return {
      valid: false,
      error:
        'These rules don\'t parse, so the discount would give nothing. Check the type, amounts ("40.00"), percentages (1 to 100) and tiers (each higher than the last).',
    };
  const entry: CampaignEntry = {
    ...data.entry,
    fields: { ...data.entry.fields, offer_rules: json },
  };
  const campaign = campaignOf(entry, data.collection?.handle);
  if (!campaign)
    return {
      valid: false,
      error: "The campaign itself can't be shown; run its checklist.",
    };
  const rows = marginRows(
    rules,
    data.products.flatMap((product) =>
      product.variants.map((variant) => ({
        title:
          variant.title && variant.title !== "Default Title"
            ? `${product.title}, ${variant.title}`
            : product.title,
        price: variant.price,
        cost: variant.cost ?? null,
      })),
    ),
  );
  const costed = rows.filter((row) => row.margin !== null);
  return {
    valid: true,
    words: offerInWords(rules),
    terms: campaignTerms(campaign, rules),
    lowest: [...costed].sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)).slice(0, 5),
    underFloor: costed.filter((row) => (row.margin ?? 0) < minMargin).length,
    withoutCost: rows.length - costed.length,
    variants: rows.length,
    minMargin,
  };
};

/** Fields a copy of a campaign doesn't keep: its sign-off and its collection. */
const NOT_COPIED = new Set([
  "approved_by",
  "approved_at",
  "collection",
  "starts_at",
  "ends_at",
  "early_access_starts_at",
]);

/**
 * A past campaign's fields for a new draft with new dates (SHO-206,
 * Duplicate). The sign-off and collection aren't copied: the copy needs
 * signing off again, and `createCampaign` makes it a collection of its own.
 * When the offer has rules the terms are rewritten for the new dates;
 * otherwise they're kept and the checklist will say if they've drifted.
 */
export const duplicateFields = (
  entry: CampaignEntry,
  startsAt: Date,
  endsAt: Date,
): { key: string; value: string }[] => {
  const fields = Object.entries(entry.fields)
    .filter(([key, value]) => !NOT_COPIED.has(key) && value !== null && value !== "")
    .map(([key, value]) => ({ key, value: value as string }));
  const copy = [
    ...fields,
    { key: "starts_at", value: startsAt.toISOString() },
    { key: "ends_at", value: endsAt.toISOString() },
  ];
  const rules = parseOfferRules(entry.fields.offer_rules);
  const campaign = campaignOf({
    ...entry,
    fields: {
      ...entry.fields,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
    },
  });
  if (rules && campaign) {
    const terms = campaignTerms(campaign, rules);
    return copy.map((field) =>
      field.key === "terms" ? { key: "terms", value: terms } : field,
    );
  }
  return copy;
};
