import { campaignEndsLabel, campaignPath } from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, Text } from "react-native";

import { useActiveCampaign } from "../lib/campaign";

/**
 * The live campaign, under the demo notice on every screen (SHO-169), opening
 * the campaign screen. Matches apps/web's CampaignBanner: the real end time,
 * no countdown.
 */
export const CampaignBanner = () => {
  const campaign = useActiveCampaign();
  if (!campaign) return null;
  return (
    <Link href={campaignPath(campaign.handle)} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${campaign.bannerText}. ${campaignEndsLabel(campaign)}`}
        className="bg-brand-700 px-4 py-2"
      >
        <Text className="text-center text-sm text-surface">
          <Text className="font-semibold underline">{campaign.bannerText}</Text> ·{" "}
          {campaignEndsLabel(campaign)}
        </Text>
      </Pressable>
    </Link>
  );
};
