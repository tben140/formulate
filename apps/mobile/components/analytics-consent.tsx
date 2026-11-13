import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  closeTrackingChoice,
  setTrackingConsent,
  TRACKING_AVAILABLE,
  useTrackingChoiceReopened,
  useTrackingConsent,
} from "../lib/tracking-consent";

/**
 * The app's tracking choice, for PostHog and Klaviyo together, the counterpart
 * of web's cookie banner: shown until the shopper chooses, and again from
 * "Privacy choices" in the footer. The wording matches web's, which covers the
 * same two vendors.
 *
 * Not a blocking modal, and Accept and Decline are the same size, the same
 * style and one tap each: a choice made under pressure, or with refusal made
 * harder, isn't valid consent (the ICO's guidance, as web's banner notes).
 */
export const AnalyticsConsent = () => {
  const consent = useTrackingConsent();
  const reopened = useTrackingChoiceReopened();
  const { bottom } = useSafeAreaInsets();

  if (!TRACKING_AVAILABLE || consent === "loading" || (consent !== "unset" && !reopened))
    return null;

  const choose = async (next: "granted" | "denied") => {
    await setTrackingConsent(next);
    closeTrackingChoice();
    // No event here: the screen tracker in app/_layout.tsx re-sends the
    // current screen as soon as the choice becomes "granted".
  };

  const button =
    "flex-1 items-center rounded-md border border-border bg-surface px-4 py-3";

  return (
    <View
      accessibilityRole="summary"
      className="absolute inset-x-0 bottom-0 border-t border-border bg-surface px-4 pt-4"
      style={{ paddingBottom: bottom + 16 }}
    >
      <Text accessibilityRole="header" className="font-semibold text-foreground">
        Tracking
      </Text>
      <Text className="mt-1 text-sm text-foreground-muted">
        With your permission, Klaviyo remembers what you browse and add to your basket so
        we can email you reminders, and PostHog measures how the app is used so we can
        improve it. Nothing is tracked unless you accept. You can change your mind from
        Privacy choices at the bottom of any screen.
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          className={button}
          onPress={() => void choose("denied")}
        >
          <Text className="text-sm font-semibold text-foreground">Decline</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          className={button}
          onPress={() => void choose("granted")}
        >
          <Text className="text-sm font-semibold text-foreground">Accept</Text>
        </Pressable>
      </View>
    </View>
  );
};
