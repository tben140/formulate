import { campaignEndsLabel, campaignPath, type Campaign } from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { CampaignBadge } from "./campaign-badge";

/**
 * The campaign on a product screen (SHO-169). Matches apps/web's
 * CampaignOffer: the offer as checkout applies it, the real end time, and the
 * subscriber perk. `variants` names the covered variants when not all are.
 */
export const CampaignOffer = ({
  campaign,
  variants,
}: {
  readonly campaign: Campaign;
  readonly variants: readonly string[] | null;
}) => (
  <View className="rounded-lg border border-brand-300 bg-brand-50 p-4">
    <View className="flex-row flex-wrap items-center gap-2">
      <CampaignBadge label={campaign.badge} />
      <Text className="text-sm text-foreground-muted">{campaignEndsLabel(campaign)}</Text>
    </View>
    <Text className="mt-2 text-sm font-semibold text-foreground">
      {campaign.offer}
      {variants ? ` (${variants.join(", ")} only)` : null}
    </Text>
    {campaign.subscriberPerk ? (
      <Text className="mt-1 text-sm text-foreground-muted">
        {campaign.subscriberPerk}.
      </Text>
    ) : null}
    <Link href={campaignPath(campaign.handle)} asChild>
      <Pressable accessibilityRole="link" className="mt-2 self-start">
        <Text className="text-sm text-foreground underline">
          See the {campaign.badge} offer and terms
        </Text>
      </Pressable>
    </Link>
  </View>
);
