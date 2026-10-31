import { toCampaign, type Campaign, type CampaignNode } from "@formulate/shopify";

import type { CampaignEntry } from "./types";

/**
 * The Admin API's campaign entry as the shape the shared rules read, so the
 * CLI judges a campaign exactly as the surfaces do (`toCampaign`).
 */
export const toNode = (
  entry: CampaignEntry,
  collectionHandle?: string | null,
): CampaignNode => {
  const field = (key: string) => ({ value: entry.fields[key] ?? null });
  return {
    handle: entry.handle,
    title: field("title"),
    startsAt: field("starts_at"),
    earlyAccessStartsAt: field("early_access_starts_at"),
    endsAt: field("ends_at"),
    badge: field("badge"),
    headline: field("headline"),
    bannerText: field("banner_text"),
    offer: field("offer"),
    discountCode: field("discount_code"),
    subscriberPerk: field("subscriber_perk"),
    body: field("body"),
    terms: field("terms"),
    audience: field("audience"),
    offerRules: field("offer_rules"),
    collection: collectionHandle ? { reference: { handle: collectionHandle } } : null,
  };
};

export const campaignOf = (
  entry: CampaignEntry,
  collectionHandle?: string | null,
): Campaign | null => toCampaign(toNode(entry, collectionHandle));
