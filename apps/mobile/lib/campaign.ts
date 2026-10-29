import {
  activeCampaign,
  CampaignByHandleQuery,
  campaignNow,
  CampaignsQuery,
  describeError,
} from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";

import { storefront } from "./storefront";

/**
 * Campaigns in the app (SHO-169). The dates are checked at render, against
 * this clock, so a campaign appears and disappears on time even from a cached
 * query.
 *
 * `EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT` (an ISO time) shows the app as it will be
 * then, to check a campaign before it starts. Development builds only.
 */
export const campaignClock = (): Date =>
  campaignNow(__DEV__ ? process.env.EXPO_PUBLIC_CAMPAIGN_PREVIEW_AT : null);

const unwrap = <T>(
  result: Awaited<ReturnType<typeof storefront.request<T, never>>>,
): T => {
  if (!result.ok) throw new Error(describeError(result.error));
  return result.data;
};

/** The live campaign, or null. Refreshed every five minutes at most. */
export const useActiveCampaign = () => {
  const { data } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => unwrap(await storefront.request(CampaignsQuery, {})),
    staleTime: 5 * 60 * 1000,
  });
  return data ? activeCampaign(data.metaobjects.nodes, campaignClock()) : null;
};

/** One campaign and its products, for its screen. */
export const useCampaign = (handle: string) =>
  useQuery({
    queryKey: ["campaign", handle],
    queryFn: async () =>
      unwrap(await storefront.request(CampaignByHandleQuery, { handle })),
    enabled: handle.length > 0,
  });
