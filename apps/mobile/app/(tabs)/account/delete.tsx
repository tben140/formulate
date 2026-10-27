import { formatDeliveryDate } from "@formulate/recharge";
import { DELETION_COPY, deletionFailureMessage } from "@formulate/shopify";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { Text } from "../../../components/text";
import { useDeleteAccount, useDeletionPreview } from "../../../lib/use-customer";

/**
 * Delete account (SHO-90), matching apps/web's /account/delete: the same
 * copy (packages/shopify), the same list of subscriptions to be cancelled, the
 * same two warnings, and a checkbox that must be ticked first.
 */
const DeleteAccountScreen = () => {
  const router = useRouter();
  const preview = useDeletionPreview();
  const deletion = useDeleteAccount();
  const [understood, setUnderstood] = useState(false);

  const outcome = deletion.data?.result;
  const failure = outcome && !outcome.ok ? outcome.reason : null;
  const ready = preview.data?.ok ? preview.data : null;
  const previewFailure =
    !preview.isPending && !ready
      ? deletionFailureMessage(
          preview.data && !preview.data.ok ? preview.data.reason : "network",
        )
      : null;
  const failureMessage = failure ? deletionFailureMessage(failure) : null;

  // Both messages appear after a request finishes. The alert role announces on
  // Android (with accessibilityLiveRegion below); iOS needs telling.
  useEffect(() => {
    if (failureMessage) AccessibilityInfo.announceForAccessibility(failureMessage);
  }, [failureMessage, deletion.submittedAt]);
  useEffect(() => {
    if (previewFailure) AccessibilityInfo.announceForAccessibility(previewFailure);
  }, [previewFailure, preview.dataUpdatedAt]);

  if (outcome?.ok) {
    return (
      <View className="gap-4 p-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          {DELETION_COPY.deleted.heading}
        </Text>
        <Text className="text-foreground">{DELETION_COPY.deleted.body}</Text>
        {deletion.data?.cleanupFailed ? (
          <Text className="text-foreground-muted">
            This phone couldn&apos;t clear everything from your old session. Close and
            reopen the app to finish.
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          className="items-center rounded-md bg-brand-600 px-4 py-3"
        >
          <Text className="text-sm font-semibold text-surface">Back to the shop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="gap-4 p-4">
      <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
        {DELETION_COPY.heading}
      </Text>
      <Text className="text-foreground">{DELETION_COPY.intro}</Text>

      {failureMessage ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="rounded-md border border-danger px-4 py-3 text-danger"
        >
          {failureMessage}
        </Text>
      ) : null}

      <Text
        accessibilityRole="header"
        className="mt-2 text-lg font-semibold text-foreground"
      >
        What happens
      </Text>
      {DELETION_COPY.whatHappens.map((line) => (
        <View key={line} className="flex-row gap-2">
          <Text aria-hidden className="text-foreground">
            •
          </Text>
          <Text className="flex-1 text-foreground">{line}</Text>
        </View>
      ))}

      {preview.isPending ? (
        <ActivityIndicator accessibilityLabel="Checking your subscriptions" />
      ) : !ready ? (
        <View className="gap-3">
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-foreground-muted"
          >
            {previewFailure}
          </Text>
          {/* A failed preview resolves as data, so nothing retries it by itself. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => void preview.refetch()}
            className="items-center rounded-md border border-border px-4 py-3"
          >
            <Text className="text-sm font-semibold text-foreground">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text
            accessibilityRole="header"
            className="mt-2 text-lg font-semibold text-foreground"
          >
            {DELETION_COPY.subscriptionsHeading}
          </Text>
          {ready.subscriptions.length === 0 ? (
            <Text className="text-foreground-muted">{DELETION_COPY.noSubscriptions}</Text>
          ) : (
            <View className="border-y border-border">
              {ready.subscriptions.map((subscription, index) => {
                const next = formatDeliveryDate(subscription.nextDelivery);
                return (
                  <View
                    key={`${subscription.title}-${index}`}
                    className={`py-3 ${index > 0 ? "border-t border-border" : ""}`}
                  >
                    <Text className="font-medium text-foreground">
                      {subscription.title}
                      {subscription.variant ? ` (${subscription.variant})` : ""}
                    </Text>
                    {next ? (
                      <Text className="text-sm text-foreground-muted">
                        Next delivery {next}
                      </Text>
                    ) : null}
                    {subscription.prepaid ? (
                      <Text className="mt-1 text-sm text-foreground">
                        {DELETION_COPY.prepaid}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          {ready.chargeToday ? (
            <Text className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
              {DELETION_COPY.chargeToday}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: understood }}
            onPress={() => setUnderstood((value) => !value)}
            className="mt-2 flex-row items-center gap-3 py-2"
          >
            <View
              className={`h-6 w-6 items-center justify-center rounded border-2 ${
                understood ? "border-brand-600 bg-brand-600" : "border-ink-400"
              }`}
            >
              {understood ? (
                <Text className="text-sm font-semibold text-surface">✓</Text>
              ) : null}
            </View>
            <Text className="flex-1 text-foreground">{DELETION_COPY.confirmLabel}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: !understood || deletion.isPending,
              busy: deletion.isPending,
            }}
            disabled={!understood || deletion.isPending}
            onPress={() => deletion.mutate()}
            className={`items-center rounded-md bg-danger px-4 py-3 ${
              !understood || deletion.isPending ? "opacity-50" : ""
            }`}
          >
            <Text className="text-sm font-semibold text-surface">
              {deletion.isPending ? "Deleting…" : DELETION_COPY.button}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            className="items-center rounded-md border border-border px-4 py-3"
          >
            <Text className="text-sm font-semibold text-foreground">Keep my account</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
};

export { DeleteAccountScreen as default };
