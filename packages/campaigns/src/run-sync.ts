import { parseOfferRules } from "@formulate/shopify";

import type { Admin } from "./admin";
import { campaignOf } from "./campaign-node";
import { isPersonalPool } from "./codes";
import { campaignDiscounts, discountConfig } from "./sync";
import {
  deactivateAutomatic,
  upsertFunctionDiscount,
  upsertShippingDiscount,
} from "./shopify-data";
import type { Snapshot } from "./types";

/**
 * Writes a campaign's discounts from its record (`campaigns sync`, and the
 * calendar's Save offer): the discount on the campaign Function with the
 * record's dates and config, and the free-delivery discount when the rules
 * have `shipping`. New discounts start switched off unless `activate`;
 * updating one never switches it on. Returns what it did, in words.
 */
export const syncCampaign = async (
  admin: Admin,
  data: Snapshot,
  { activate = false }: { readonly activate?: boolean } = {},
): Promise<string[]> => {
  const campaign = campaignOf(data.entry, data.collection?.handle);
  if (!campaign) throw new Error("The campaign can't be shown; run check for why.");
  const result = discountConfig(data.entry, data.collection, data.products);
  if ("error" in result) throw new Error(`Can't sync: ${result.error}.`);
  const said: string[] = [];

  const existing = campaignDiscounts(data.entry, data.discounts).find(
    (d) => d.kind === "app" && !isPersonalPool(d.config),
  );
  const id = await upsertFunctionDiscount(admin, {
    existingId: existing?.id ?? null,
    title: `${campaign.title} (campaign)`,
    code: campaign.discountCode,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    config: result.config,
    activate,
  });
  said.push(
    existing
      ? `Updated ${id}.${activate ? " Updating doesn't switch it on: activate it in the admin." : ""}`
      : `Created ${id}${activate ? "" : ", switched off: activate it in the admin, and switch off any plain discount it replaces"}.`,
  );

  const rules = parseOfferRules(data.entry.fields.offer_rules);
  if (rules?.shipping) {
    const ship = campaignDiscounts(data.entry, data.discounts).find(
      (d) => d.kind === "shipping",
    );
    const shipId = await upsertShippingDiscount(admin, {
      existingId: ship?.id ?? null,
      title: `${campaign.title} (free delivery)`,
      startsAt: campaign.startsAt.toISOString(),
      endsAt: campaign.endsAt.toISOString(),
      minSubtotal: rules.shipping.minSubtotal.amount,
      maxRate: rules.shipping.maxRate?.amount ?? null,
    });
    if (!ship && !activate) await deactivateAutomatic(admin, shipId);
    said.push(
      ship
        ? `Updated free delivery ${shipId}.`
        : `Created free delivery ${shipId}${activate ? "" : ", switched off"}.`,
    );
  }
  return said;
};
