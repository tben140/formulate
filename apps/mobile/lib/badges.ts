import { BadgesQuery, toBadges, type Badge } from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";

import { storefront } from "./storefront";

/**
 * Every `badge` metaobject (SHO-202), for the rule badges. Shop-wide and
 * rarely edited: fetched once and kept for ten minutes. A failure means no
 * rule badges rather than an error: badges are an extra.
 */
export const useBadges = (): readonly Badge[] => {
  const { data } = useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const result = await storefront.request(BadgesQuery, {});
      return result.ok ? toBadges(result.data.metaobjects.nodes) : [];
    },
    staleTime: 10 * 60 * 1000,
  });
  return data ?? [];
};
