import { colours } from "@formulate/tokens";
import { SOCIAL_LINKS } from "@formulate/tokens/social";
import { Linking, Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The brand's social accounts, as icon links in the footer. The list, its
 * placeholder URLs and the icon paths are shared with web and the theme
 * (packages/tokens/src/social.ts). Each opens in the platform's app or the
 * browser.
 */
export const SocialLinks = () => (
  // -ml-3 lines the first icon up with the text above: each 20px icon sits
  // centred in a 44px tap target.
  <View className="-ml-3 flex-row flex-wrap gap-2" accessibilityLabel="Social media">
    {SOCIAL_LINKS.map((link) => (
      <Pressable
        key={link.id}
        accessibilityRole="link"
        accessibilityLabel={link.label}
        onPress={() => void Linking.openURL(link.url)}
        className="size-11 items-center justify-center rounded-full"
      >
        <Svg
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill={colours["foreground-muted"]}
        >
          <Path d={link.path} />
        </Svg>
      </Pressable>
    ))}
  </View>
);
