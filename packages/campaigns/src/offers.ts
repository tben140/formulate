import { parseOfferRules, type OfferRules } from "@formulate/shopify";

import { SEGMENT_KEYS, segmentTag, type SegmentKey } from "./segments";
import { discountConfig, functionRules, usedTag, type DiscountConfig } from "./sync";
import type { CampaignEntry, CollectionInfo, ProductInfo } from "./types";

/**
 * Offers per segment (SHO-207 step 3, docs/campaign-segments.md): the
 * campaign record's optional `offers` JSON, beside `offer_rules`. Each one is
 * a segment, how its members get it, and its own rules, parsed exactly as
 * `offer_rules` is.
 */

/** How a segment's members get their offer. */
export const SEGMENT_DELIVERIES = ["sign_in", "email_link", "codes"] as const;
export type SegmentDelivery = (typeof SEGMENT_DELIVERIES)[number];

/** Only `sign_in` is synced so far: the Function checks the customer's tag. */
export const SYNCED_DELIVERIES: readonly SegmentDelivery[] = ["sign_in"];

export interface SegmentOffer {
  readonly segment: SegmentKey;
  readonly delivery: SegmentDelivery;
  readonly rules: OfferRules;
}

/** As the terms name them: plain, and never a label a shopper would mind. */
export const SEGMENT_AUDIENCE: Record<SegmentKey, string> = {
  active: "Subscribers",
  lapsed: "Past subscribers",
  at_risk: "Selected subscribers",
  one_time: "Returning customers",
  dormant: "Customers we haven't seen in a while",
  best: "Our most loyal customers",
};

export const parseSegmentOffers = (
  json: string | null | undefined,
): { offers: SegmentOffer[]; problems: string[] } => {
  if (!json?.trim()) return { offers: [], problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { offers: [], problems: ["offers isn't JSON"] };
  }
  if (!Array.isArray(raw)) return { offers: [], problems: ["offers isn't a list"] };
  const offers: SegmentOffer[] = [];
  const problems: string[] = [];
  raw.forEach((item: unknown, i) => {
    const at = `offers[${i}]`;
    if (typeof item !== "object" || item === null) {
      problems.push(`${at} isn't an object`);
      return;
    }
    const { segment, delivery, rules } = item as Record<string, unknown>;
    if (!SEGMENT_KEYS.includes(segment as SegmentKey)) {
      problems.push(`${at}: segment is one of ${SEGMENT_KEYS.join(", ")}`);
      return;
    }
    if (!SEGMENT_DELIVERIES.includes(delivery as SegmentDelivery)) {
      problems.push(`${at}: delivery is one of ${SEGMENT_DELIVERIES.join(", ")}`);
      return;
    }
    if (offers.some((offer) => offer.segment === segment)) {
      problems.push(`${at}: ${String(segment)} already has an offer`);
      return;
    }
    const parsed = parseOfferRules(JSON.stringify(rules));
    if (!parsed) {
      problems.push(`${at}: rules don't parse (the same rules as offer_rules)`);
      return;
    }
    // The segment is the audience; free delivery stays the campaign's own.
    if (parsed.audienceTags.length > 0 || parsed.shipping) {
      problems.push(`${at}: rules can't set audienceTags or shipping`);
      return;
    }
    offers.push({
      segment: segment as SegmentKey,
      delivery: delivery as SegmentDelivery,
      rules: parsed,
    });
  });
  return { offers, problems };
};

/** The segment a Function discount's config is for, or null for the public one. */
export const segmentOf = (config: unknown): string | null => {
  const segment = (config as { segment?: unknown } | null)?.segment;
  return typeof segment === "string" ? segment : null;
};

/**
 * The Function config for each synced segment offer: the campaign's own
 * config (collection, variants, badge), with the segment's rules and only
 * that segment's tag as the audience.
 */
export const segmentDiscountConfigs = (
  entry: CampaignEntry,
  collection: CollectionInfo | null,
  products: readonly ProductInfo[],
  offers: readonly SegmentOffer[],
):
  | { readonly configs: { segment: SegmentKey; config: DiscountConfig }[] }
  | { readonly error: string } => {
  const base = discountConfig(entry, collection, products);
  if ("error" in base) return base;
  return {
    configs: offers
      .filter((offer) => SYNCED_DELIVERIES.includes(offer.delivery))
      .map((offer) => ({
        segment: offer.segment,
        config: {
          ...base.config,
          segment: offer.segment,
          rules: functionRules(offer.rules),
          usedTags: offer.rules.oncePerCustomer ? [usedTag(entry.handle)] : [],
          audienceTags: [segmentTag(offer.segment)],
        },
      })),
  };
};
