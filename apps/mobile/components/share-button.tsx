import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Share } from "react-native";

/**
 * Shares a web link from a screen's header (SHO-63). Renders nothing without
 * a URL, so an app built without EXPO_PUBLIC_WEB_URL has no dead button.
 */
export const ShareButton = ({
  url,
  title,
}: {
  readonly url: string | null;
  readonly title: string;
}) => {
  if (!url) return null;
  return (
    <Pressable
      onPress={() => {
        // iOS shares `url` as a link; Android only reads `message`, so the URL
        // goes in both.
        void Share.share({ title, message: url, url });
      }}
      accessibilityRole="button"
      accessibilityLabel={`Share ${title}`}
      hitSlop={8}
    >
      <Ionicons name="share-outline" size={22} color="#0f172a" />
    </Pressable>
  );
};
