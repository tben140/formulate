import type { SubscribeResult } from "@formulate/analytics";
import { useState } from "react";
import {
  AccessibilityInfo,
  Keyboard,
  Platform,
  Pressable,
  TextInput,
  View,
} from "react-native";

import { fontFor } from "../lib/fonts";
import { notifyWhenBackInStock } from "../lib/klaviyo";
import { Text } from "./text";

/** Same copy as web's BackInStockForm and the footer form. */
const errorMessage = (result: Extract<SubscribeResult, { ok: false }>): string => {
  switch (result.reason) {
    case "empty":
      return "Enter your email address.";
    case "invalid-email":
      return "That doesn't look like an email address. Check it and try again.";
    case "rate-limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "not-configured":
      return "Restock alerts aren't available at the moment.";
    case "network":
      return "We couldn't reach our email service. Check your connection and try again.";
    case "rejected":
      return "Something went wrong at our end. Please try again.";
  }
};

/**
 * "Email me when it's back" on a sold-out variant (SHO-118), the app's
 * counterpart of web's and the theme's. Posts through the Worker; Klaviyo's
 * live "Back in stock" flow sends the email on restock.
 *
 * Worded as a one-off alert, not marketing. The product screen keys it by
 * variant, so choosing another sold-out variant starts it afresh.
 */
export const BackInStockForm = ({
  variantId,
  itemName,
}: {
  readonly variantId: string;
  readonly itemName: string;
}) => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async () => {
    if (pending) return;
    // The message sits below the field, where the keyboard is (SHO-120).
    Keyboard.dismiss();
    setPending(true);
    const result = await notifyWhenBackInStock(email, variantId);
    const text = result.ok ? "We'll email you when it's back." : errorMessage(result);
    setMessage(text);
    setFailed(!result.ok);
    if (result.ok) setEmail("");
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
    setPending(false);
  };

  return (
    <View className="mt-4 rounded-md border border-border p-4">
      <Text className="text-sm font-semibold text-foreground">
        Email me when it&apos;s back
      </Text>
      <Text className="mt-1 text-xs text-foreground-muted">
        {`One email when ${itemName} is back in stock. This doesn't sign you up for marketing.`}
      </Text>

      <View className="mt-3 flex-row gap-2">
        <TextInput
          style={{ fontFamily: fontFor() }}
          value={email}
          onChangeText={(next) => {
            setEmail(next);
            if (message) setMessage("");
            setFailed(false);
          }}
          onSubmitEditing={onSubmit}
          editable={!pending}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="go"
          placeholder="you@company.com"
          accessibilityLabel={`Email me when ${itemName} is back`}
          className={`min-w-0 flex-1 rounded-md border px-3 py-2 text-sm text-foreground ${
            failed ? "border-danger" : "border-border"
          }`}
        />
        <Pressable
          onPress={() => void onSubmit()}
          disabled={pending}
          accessibilityRole="button"
          aria-disabled={pending}
          aria-busy={pending}
          className={`rounded-md px-4 py-2 ${pending ? "bg-ink-300" : "bg-brand-600"}`}
        >
          <Text className="text-sm font-semibold text-surface">
            {pending ? "Sending…" : "Notify me"}
          </Text>
        </Pressable>
      </View>

      <Text
        accessibilityLiveRegion="polite"
        className={`mt-2 min-h-5 text-sm ${failed ? "text-danger" : "text-success"}`}
      >
        {message}
      </Text>
    </View>
  );
};
