import { campaignCartProgress, offerLines, type Cart } from "@formulate/shopify";
import { Text, View } from "react-native";

import { useActiveCampaign } from "../lib/campaign";

/**
 * A tiered or bundle campaign in the cart (SHO-169): what's reached, and how
 * far to the next step. Matches apps/web's CampaignCartHint, from the same
 * shared function; Shopify works out the discount itself at checkout.
 */
export const CampaignCartHint = ({
  lines,
}: {
  readonly lines: Cart["lines"]["nodes"];
}) => {
  const campaign = useActiveCampaign();
  const progress = campaign
    ? campaignCartProgress(campaign.rules, offerLines(campaign, lines), campaign.badge)
    : null;
  if (!progress) return null;
  return (
    <View className="gap-1 border-b border-border bg-brand-50 px-4 py-3">
      {progress.reached ? (
        <Text className="text-sm font-semibold text-foreground">{progress.reached}</Text>
      ) : null}
      {progress.next ? (
        <Text className="text-sm text-foreground">{progress.next}</Text>
      ) : null}
    </View>
  );
};
