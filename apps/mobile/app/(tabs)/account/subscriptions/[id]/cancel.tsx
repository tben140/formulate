import {
  CANCEL_REASONS,
  changeErrorMessage,
  type CancelReason,
  type SubscriptionChange,
} from "@formulate/recharge";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from "react-native";

import { Text } from "../../../../../components/text";
import { fontFor } from "../../../../../lib/fonts";
import { useChangeSubscription, useSubscription } from "../../../../../lib/use-customer";

/** One alternative to cancelling: a button that makes that change instead. */
const Offer = ({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    className="min-h-11 justify-center rounded-md border border-border px-4 py-2"
  >
    <Text className="text-sm font-semibold text-foreground">{label}</Text>
  </Pressable>
);

/**
 * Cancelling, with alternatives first (SHO-74), matching apps/web's
 * /account/subscriptions/[id]/cancel.
 *
 * ⚠️ Cancelling is never more than this one screen and one press (SHO-91):
 * the offers sit above the cancel button, not in front of it, and a reason is
 * optional.
 */
const CancelScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSubscription(id);
  const change = useChangeSubscription(Number(id));
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading this subscription" />
      </View>
    );
  }
  if (query.isError) {
    // The load failed, which isn't the same as "can't be cancelled": say so,
    // and announce it, as the subscription screen does.
    return (
      <Text accessibilityRole="alert" className="p-4 text-foreground">
        {query.error.message}
      </Text>
    );
  }
  const subscription = query.data?.subscription;
  if (!subscription || subscription.status !== "active") {
    return (
      <Text className="p-4 text-foreground">
        This subscription can&apos;t be cancelled from here.
      </Text>
    );
  }

  const run = (next: SubscriptionChange) => {
    setError(null);
    change.mutate(next, {
      onSuccess: (result) => {
        if (!result.ok) {
          setError(changeErrorMessage(result.reason));
          return;
        }
        // Back to the subscription, which says what happened (and offers Undo).
        const charge = result.skippedChargeId ? `&charge=${result.skippedChargeId}` : "";
        // dismissTo, not replace: back to the subscription screen already
        // underneath, so Back doesn't show it twice.
        router.dismissTo(`/account/subscriptions/${id}?done=${next.action}${charge}`);
      },
    });
  };
  const pending = change.isPending;

  return (
    <ScrollView
      contentContainerClassName="p-4"
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        Cancel {subscription.product_title}?
      </Text>

      <Text
        accessibilityRole="header"
        className="mt-6 text-lg font-semibold text-foreground"
      >
        Or, instead
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-3">
        {subscription.is_skippable ? (
          <Offer
            label="Skip the next delivery"
            disabled={pending}
            onPress={() => run({ action: "skip" })}
          />
        ) : null}
        <Offer
          label="Pause for a month"
          disabled={pending}
          onPress={() => run({ action: "pause", months: 1 })}
        />
        {subscription.quantity > 1 ? (
          <Offer
            label="Get 1 per delivery"
            disabled={pending}
            onPress={() => run({ action: "quantity", quantity: 1 })}
          />
        ) : null}
      </View>

      <View className="mt-8 border-t border-border pt-6">
        <Text className="font-semibold text-foreground">
          Why are you cancelling? <Text className="font-normal">(optional)</Text>
        </Text>
        <View accessibilityRole="radiogroup" className="mt-3 gap-1">
          {CANCEL_REASONS.map((option) => {
            const checked = reason === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setReason(checked ? null : option.value)}
                accessibilityRole="radio"
                // aria-checked, as in components/add-to-cart.tsx (#69): it's
                // what react-native-web turns into the radio's checked state,
                // and native reads it too.
                aria-checked={checked}
                className="min-h-11 flex-row items-center gap-3"
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded-full border ${
                    checked ? "border-brand-600" : "border-border"
                  }`}
                >
                  {checked ? (
                    <View className="h-2.5 w-2.5 rounded-full bg-brand-600" />
                  ) : null}
                </View>
                <Text className="text-sm text-foreground">{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text nativeID="cancel-comment-label" className="mt-4 text-sm text-foreground">
          Anything else? (optional)
        </Text>
        <TextInput
          style={{ fontFamily: fontFor() }}
          value={comment}
          onChangeText={setComment}
          maxLength={300}
          multiline
          accessibilityLabelledBy="cancel-comment-label"
          accessibilityLabel="Anything else? (optional)"
          className="mt-1 min-h-20 rounded-md border border-border px-3 py-2 text-foreground"
        />

        <Text className="mt-4 text-sm text-foreground-muted">
          Nothing more is charged after you cancel. A delivery that has already been
          charged still arrives.
        </Text>

        {error ? (
          <Text accessibilityRole="alert" className="mt-4 text-sm text-danger">
            {error}
          </Text>
        ) : null}

        <View className="mt-4 flex-row flex-wrap items-center gap-4">
          <Pressable
            onPress={() =>
              run({
                action: "cancel",
                reason: reason ?? "other",
                ...(comment.trim() ? { comment: comment.trim() } : {}),
              })
            }
            disabled={pending}
            accessibilityRole="button"
            accessibilityState={{ busy: pending, disabled: pending }}
            className={`min-h-11 justify-center rounded-md bg-danger px-4 py-2 ${pending ? "opacity-60" : ""}`}
          >
            <Text className="text-sm font-semibold text-surface">
              {pending ? "Cancelling…" : "Cancel subscription"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            className="min-h-11 justify-center"
          >
            <Text className="text-sm text-brand-600 underline">Keep my subscription</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
};

export { CancelScreen as default };
