import { campaignEndsLabel, campaignPath, campaignStartsLabel } from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { stopCampaignPreview, useActiveCampaign, useCampaignView } from "../lib/campaign";

/**
 * The live campaign, under the demo notice on every screen (SHO-169), opening
 * the campaign screen. Matches apps/web's CampaignBanner: the real end time,
 * no countdown.
 */
export const CampaignBanner = () => {
  const campaign = useActiveCampaign();
  const { preview } = useCampaignView();
  if (!campaign) return null;
  return (
    <View>
      {preview === campaign.handle ? (
        <View className="flex-row flex-wrap items-center justify-center gap-x-2 border-b-2 border-dashed border-brand-700 bg-brand-100 px-4 py-2">
          <Text className="text-center text-sm text-foreground">
            <Text className="font-semibold">Previewing {campaign.title}</Text> in this app
            only. Checkout applies the discount from its real start (
            {campaignStartsLabel(campaign).replace("Starts ", "")}).
          </Text>
          <Pressable accessibilityRole="button" onPress={stopCampaignPreview}>
            <Text className="text-sm font-semibold text-foreground underline">
              Stop preview
            </Text>
          </Pressable>
        </View>
      ) : null}
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
    </View>
  );
};
