import { DEMO_STORE_NOTICE } from "@formulate/shopify";
import { Text, View } from "react-native";

/**
 * The demo-store notice, directly below the native header on every screen.
 *
 * Mounted once through the stack's `screenLayout` rather than per screen, so a
 * new screen cannot forget it and no screen's loading or error branch skips it.
 * Not dismissible, for the same reason as on web. Same words: shared constant.
 */
export const DemoNotice = () => (
  <View className="bg-ink-900 px-4 py-2">
    <Text className="text-center text-xs text-surface">
      <Text className="font-semibold">{DEMO_STORE_NOTICE.label}</Text> —{" "}
      {DEMO_STORE_NOTICE.message}
    </Text>
  </View>
);
