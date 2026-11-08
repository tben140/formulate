import { Image as RNImage, type ImageStyle, type StyleProp } from "react-native";

/**
 * expo-image for Storybook: React Native's own Image, which React Native Web
 * renders as an <img>. expo-image's web build reaches into Expo's native
 * module layer, which the browser doesn't have.
 */
export const Image = ({
  source,
  style,
  accessibilityLabel,
}: {
  source?: string | { uri: string } | null;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) => (
  <RNImage
    source={typeof source === "string" ? { uri: source } : (source ?? undefined)}
    style={style}
    accessibilityLabel={accessibilityLabel}
  />
);
