import { activeCampaign, campaignNow, CampaignsQuery } from "@formulate/shopify";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * Campaigns on web (SHO-169). Pages render per request, so a campaign appears
 * and disappears on its dates with nothing to revalidate.
 *
 * `CAMPAIGN_PREVIEW_AT` (an ISO time) shows the site as it will be then, to
 * check a campaign before it starts. Ignored in production.
 */
export const now = (): Date =>
  campaignNow(
    process.env.VERCEL_ENV === "production" ? null : process.env.CAMPAIGN_PREVIEW_AT,
  );

/** The live campaign, or null. A failed request shows no banner, not an error. */
export const getActiveCampaign = cache(async () => {
  const result = await storefront.request(CampaignsQuery, {});
  return result.ok ? activeCampaign(result.data.metaobjects.nodes, now()) : null;
});
