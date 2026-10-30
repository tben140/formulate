import {
  campaignEndsLabel,
  campaignPath,
  campaignStartsLabel,
  type Campaign,
} from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import {
  stopCampaignPreview,
  useActiveCampaign,
  useCampaignEnds,
  useCampaignView,
} from "../lib/campaign";

/**
 * The live campaign, under the demo notice on every screen (SHO-169), opening
 * the campaign screen. Matches apps/web's CampaignBanner: the real end time,
 * counting down in the last day.
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
      <BannerLink campaign={campaign} />
    </View>
  );
};

/** A component of its own, so the countdown's hook runs only with a campaign. */
const BannerLink = ({ campaign }: { readonly campaign: Campaign }) => {
  const ends = useCampaignEnds(campaign.endsAt, campaignEndsLabel(campaign));
  return (
    <Link href={campaignPath(campaign.handle)} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${campaign.bannerText}. ${ends}`}
        className="bg-brand-700 px-4 py-2"
      >
        <Text className="text-center text-sm text-surface">
          <Text className="font-semibold underline">{campaign.bannerText}</Text> · {ends}
        </Text>
      </Pressable>
    </Link>
  );
};
