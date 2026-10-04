import {
  freeShippingMessage,
  freeShippingProgress,
  type MoneyLike,
} from "@formulate/shopify";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Platform, View } from "react-native";
import { Text } from "./text";

/**
 * How far the cart is from free standard delivery. The counterpart of apps/web's
 * <FreeShippingBar /> and the theme's cart-drawer section, from the same shared
 * `freeShippingProgress`.
 *
 * Changes are announced with both `accessibilityLiveRegion` (Android) and
 * `announceForAccessibility` (iOS). The prop alone does nothing on iOS; see the
 * note on `announce()` in email-capture.tsx.
 *
 * Only a *change* is announced. The first message, when the sheet opens, is
 * left for VoiceOver to reach in reading order. Announcing it would talk over
 * the sheet's own arrival.
 */
export const FreeShippingBar = ({
  subtotal,
}: {
  readonly subtotal: MoneyLike | null;
}) => {
  const progress = subtotal ? freeShippingProgress(subtotal) : null;
  const message = progress ? freeShippingMessage(progress) : "";

  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (previous.current !== null && message && message !== previous.current) {
      if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
    }
    previous.current = message;
  }, [message]);

  if (!progress) return null;

  return (
    <View className="border-b border-border px-4 py-3">
      <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
        {message}
      </Text>

      {/* Decoration. The sentence above carries the information. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100"
      >
        <View
          className={`h-full rounded-full ${
            progress.kind === "unlocked" ? "bg-success" : "bg-brand-600"
          }`}
          style={{ width: `${Math.floor(progress.fraction * 100)}%` }}
        />
      </View>
    </View>
  );
};
