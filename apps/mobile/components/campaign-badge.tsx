import { Text, View } from "react-native";

/** A campaign's label on a row or product screen (SHO-169). */
export const CampaignBadge = ({ label }: { readonly label: string }) => (
  <View className="self-start rounded-full bg-brand-700 px-2 py-0.5">
    <Text className="text-xs font-semibold text-surface">{label}</Text>
  </View>
);
