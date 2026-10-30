import { campaignEndsLabel, type Campaign } from "@formulate/shopify";
import { Text } from "react-native";

import { useCampaignEnds } from "../lib/campaign";

/**
 * A campaign's end: the date, or a countdown in its last day (SHO-169).
 * Matches apps/web's CampaignEnds.
 */
export const CampaignEnds = ({
  campaign,
  className,
}: {
  readonly campaign: Campaign;
  readonly className?: string;
}) => (
  <Text className={className}>
    {useCampaignEnds(campaign.endsAt, campaignEndsLabel(campaign))}
  </Text>
);
