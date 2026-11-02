import { BadgesQuery, toBadges, type Badge } from "@formulate/shopify";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * Every `badge` metaobject (SHO-202), for the rule badges. Shop-wide and
 * rarely edited, so cached for a few minutes rather than fetched per card or
 * per page view. A failed request isn't cached, and means no rule badges:
 * badges are an extra, never a reason for a page to fail.
 */
const cachedBadgeNodes = unstable_cache(
  async () => {
    const result = await storefront.request(BadgesQuery, {});
    if (!result.ok) throw new Error("badges unavailable");
    return result.data.metaobjects.nodes;
  },
  ["badge-nodes"],
  { revalidate: 300 },
);

export const getBadges = cache(async (): Promise<Badge[]> => {
  try {
    return toBadges(await cachedBadgeNodes());
  } catch {
    return [];
  }
});
