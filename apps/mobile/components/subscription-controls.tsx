import {
  changeDoneMessage,
  changeErrorMessage,
  isoDateFrom,
  MAX_PAUSE_MONTHS,
  MAX_SUBSCRIPTION_QUANTITY,
  type BlendOption,
  type RechargeSubscription,
  type SubscriptionChange,
  type SubscriptionChangeResult,
} from "@formulate/recharge";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, View } from "react-native";

import { useChangeSubscription } from "../lib/use-customer";
import { Text } from "./text";

/**
 * What a customer can change on one subscription in the app (SHO-73, SHO-74),
 * matching apps/web's components/subscription-controls.tsx. The wording and
 * limits come from @formulate/recharge, so the two can't drift.
 *
 * One difference: web has a date field. React Native has no built-in date
 * picker, and a new native dependency isn't worth it for v1, so the app
 * offers "a week earlier / later" instead. Pause covers longer gaps.
 */

const Button = ({
  label,
  onPress,
  busy,
  disabled,
  tone = "secondary",
  accessibilityHint,
  accessibilityLabel,
  locked,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: "primary" | "secondary";
  accessibilityHint?: string;
  accessibilityLabel?: string;
  /** Another change is saving: one at a time, so results can't cross. */
  locked?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy || disabled || locked}
    accessibilityRole="button"
    accessibilityState={{
      busy: Boolean(busy),
      disabled: Boolean(busy || disabled || locked),
    }}
    accessibilityHint={accessibilityHint}
    accessibilityLabel={accessibilityLabel}
    className={`min-h-11 justify-center rounded-md px-4 py-2 ${
      tone === "primary" ? "bg-brand-600" : "border border-border"
    } ${busy || disabled || locked ? "opacity-60" : ""}`}
  >
    <Text
      className={`text-sm font-semibold ${tone === "primary" ? "text-surface" : "text-foreground"}`}
    >
      {busy ? "Saving…" : label}
    </Text>
  </Pressable>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View className="border-b border-border py-4">
    <Text accessibilityRole="header" className="font-semibold text-foreground">
      {title}
    </Text>
    <View className="mt-3 flex-row flex-wrap gap-3">{children}</View>
  </View>
);

/** The last change's outcome, announced to screen readers when it appears. */
const Outcome = ({
  outcome,
  onUndo,
  undoing,
  locked,
}: {
  outcome: { action: string; result: SubscriptionChangeResult } | null;
  onUndo: (chargeId: number) => void;
  undoing: boolean;
  locked: boolean;
}) => {
  const message = outcome
    ? outcome.result.ok
      ? changeDoneMessage(outcome.action)
      : changeErrorMessage(outcome.result.reason)
    : null;

  // Keyed on the outcome, not its text: pausing twice gives the same message,
  // and the second still has to be announced. Each change is a new object.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `message` derives from `outcome`
  }, [outcome]);

  if (!outcome || !message) return null;
  const skipped =
    outcome.result.ok && outcome.action === "skip"
      ? outcome.result.skippedChargeId
      : undefined;
  return (
    <View
      accessibilityLiveRegion="polite"
      className={`mt-4 flex-row flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 ${
        outcome.result.ok ? "border-border" : "border-danger"
      }`}
    >
      <Text
        accessibilityRole={outcome.result.ok ? "text" : "alert"}
        className="flex-1 text-sm text-foreground"
      >
        {message}
      </Text>
      {skipped ? (
        <Button
          label="Undo"
          busy={undoing}
          locked={locked}
          onPress={() => onUndo(skipped)}
        />
      ) : null}
    </View>
  );
};

export const SubscriptionControls = ({
  subscription,
  arrivedAfter,
  blendOptions = [],
}: {
  readonly subscription: RechargeSubscription;
  /** For a daily pack: the range to choose from (from the Worker). */
  readonly blendOptions?: readonly BlendOption[];
  /** A change made on the cancel screen, which came back here to say so. */
  readonly arrivedAfter?: { readonly action: string; readonly chargeId?: number };
}) => {
  const change = useChangeSubscription(subscription.id);
  const [outcome, setOutcome] = useState<{
    action: string;
    result: SubscriptionChangeResult;
  } | null>(
    arrivedAfter
      ? {
          action: arrivedAfter.action,
          result: { ok: true, skippedChargeId: arrivedAfter.chargeId },
        }
      : null,
  );
  // What the stepper shows: the customer's unsaved choice, else the saved quantity.
  const [chosenQuantity, setChosenQuantity] = useState<number | null>(null);
  const quantity = chosenQuantity ?? subscription.quantity;
  const setQuantity = (update: (current: number) => number) =>
    setChosenQuantity(update(quantity));

  // A daily pack's ingredients: the unsaved choice, else the saved blend.
  const savedBlend = subscription.blend ?? [];
  const [chosenBlend, setChosenBlend] = useState<string[] | null>(null);
  // Saved codes that have left the range have no checkbox to untick, so they
  // start unticked: the shopper picks a replacement to fill the gap.
  const blend =
    chosenBlend ??
    savedBlend.filter((code) => blendOptions.some((option) => option.code === code));
  const toggleBlend = (code: string) =>
    setChosenBlend(
      blend.includes(code) ? blend.filter((c) => c !== code) : [...blend, code],
    );

  const run = (next: SubscriptionChange) => {
    change.mutate(next, {
      onSuccess: (result) => {
        setOutcome({ action: next.action, result });
        if (result.ok && next.action === "quantity") setChosenQuantity(null);
        if (result.ok && next.action === "blend") setChosenBlend(null);
      },
    });
  };
  const busy = (action: string, detail?: string | number) => {
    const pending = change.isPending ? change.variables : undefined;
    if (!pending || pending.action !== action) return false;
    if (detail === undefined) return true;
    return (
      ("months" in pending && pending.months === detail) ||
      ("date" in pending && pending.date === detail)
    );
  };

  const outcomeView = (
    <Outcome
      outcome={outcome}
      undoing={busy("unskip")}
      locked={change.isPending}
      onUndo={(chargeId) => run({ action: "unskip", chargeId })}
    />
  );

  if (subscription.status === "cancelled") {
    return (
      <View className="mt-6">
        {outcomeView}
        <View className="mt-4 flex-row">
          <Button
            locked={change.isPending}
            tone="primary"
            label="Restart this subscription"
            busy={busy("reactivate")}
            onPress={() => run({ action: "reactivate" })}
          />
        </View>
      </View>
    );
  }
  if (subscription.status !== "active") return outcomeView;

  const next = subscription.next_charge_scheduled_at?.slice(0, 10) ?? null;
  const tomorrow = isoDateFrom(new Date(), 1);
  const shifts = next
    ? [
        { label: "1 week earlier", date: isoDateFrom(next, -7) },
        { label: "1 week later", date: isoDateFrom(next, 7) },
        { label: "2 weeks later", date: isoDateFrom(next, 14) },
      ].filter((shift) => shift.date >= tomorrow)
    : [];

  return (
    <View className="mt-6">
      <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
        Manage
      </Text>
      {outcomeView}

      {savedBlend.length > 0 && blendOptions.length > 0 ? (
        <Section title="Your blend">
          <View className="w-full gap-2">
            <Text className="text-sm text-foreground-muted">
              Choose {savedBlend.length}. Your price stays the same; the change applies
              from your next delivery.
            </Text>
            {blendOptions.map((option) => {
              const checked = blend.includes(option.code);
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPress={() => toggleBlend(option.code)}
                  className="min-h-11 flex-row items-center gap-2"
                >
                  <Text className="text-base text-foreground">{checked ? "☑" : "☐"}</Text>
                  <Text className="text-sm text-foreground">{option.name}</Text>
                </Pressable>
              );
            })}
            <View className="flex-row">
              <Button
                locked={change.isPending}
                label="Save blend"
                busy={busy("blend")}
                disabled={
                  blend.length !== savedBlend.length ||
                  blend.every((code) => savedBlend.includes(code))
                }
                accessibilityHint={
                  blend.length !== savedBlend.length
                    ? `Choose exactly ${savedBlend.length}.`
                    : undefined
                }
                onPress={() => run({ action: "blend", codes: blend })}
              />
            </View>
          </View>
        </Section>
      ) : null}

      {subscription.is_skippable ? (
        <Section title="Skip the next delivery">
          <Button
            locked={change.isPending}
            label="Skip next delivery"
            accessibilityHint="Nothing is charged or sent; the one after goes ahead as normal."
            busy={busy("skip")}
            onPress={() => run({ action: "skip" })}
          />
        </Section>
      ) : null}

      <Section title="Pause">
        {Array.from({ length: MAX_PAUSE_MONTHS }, (_, i) => i + 1).map((months) => (
          <Button
            locked={change.isPending}
            key={months}
            label={months === 1 ? "1 month" : `${months} months`}
            accessibilityHint={`Moves the next delivery back by ${months === 1 ? "a month" : `${months} months`}.`}
            busy={busy("pause", months)}
            onPress={() => run({ action: "pause", months })}
          />
        ))}
      </Section>

      {shifts.length > 0 ? (
        <Section title="Move the next delivery">
          {shifts.map((shift) => (
            <Button
              locked={change.isPending}
              key={shift.label}
              label={shift.label}
              busy={busy("reschedule", shift.date)}
              onPress={() => run({ action: "reschedule", date: shift.date })}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Quantity per delivery">
        <View className="flex-row items-center gap-3">
          <Button
            locked={change.isPending}
            label="−"
            accessibilityLabel="One fewer"
            disabled={quantity <= 1}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          />
          <Text
            accessibilityLabel={`${quantity} per delivery`}
            className="min-w-6 text-center font-mono text-foreground"
          >
            {quantity}
          </Text>
          <Button
            locked={change.isPending}
            label="+"
            accessibilityLabel="One more"
            disabled={quantity >= MAX_SUBSCRIPTION_QUANTITY}
            onPress={() => setQuantity((q) => Math.min(MAX_SUBSCRIPTION_QUANTITY, q + 1))}
          />
          <Button
            locked={change.isPending}
            label="Update"
            disabled={quantity === subscription.quantity}
            busy={busy("quantity")}
            onPress={() => run({ action: "quantity", quantity })}
          />
        </View>
      </Section>

      <View className="py-4">
        <Link href={`/account/subscriptions/${subscription.id}/cancel`} asChild>
          <Pressable accessibilityRole="link" className="min-h-11 justify-center">
            <Text className="text-sm text-brand-600 underline">Cancel subscription</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
};
