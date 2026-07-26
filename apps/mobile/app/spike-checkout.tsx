import { useShopifyCheckoutSheet } from "@shopify/checkout-sheet-kit";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import {
  RECHARGE_30_DAY_PLAN,
  RECHARGE_SKI_WAX_VARIANT,
  createSpikeCartWithLines,
  type SpikeLine,
} from "../lib/spike-cart";
import { useProduct } from "../lib/queries";

/**
 * SPIKE ONLY (SHO-56) — scratch screen, not for merge.
 *
 * Answers empirically:
 *   Q1  does Checkout Kit run in a dev build on Expo SDK 57
 *   Q3  which lifecycle events actually fire, and what they carry
 */
const stamp = (line: string) => `${new Date().toISOString().slice(11, 19)}  ${line}`;

const SpikeCheckoutScreen = () => {
  const checkout = useShopifyCheckoutSheet();
  const { data } = useProduct("the-collection-snowboard-liquid");
  // Seeded here rather than in an effect: calling setState synchronously on
  // mount triggers a cascading render.
  const [log, setLog] = useState<string[]>(() => [
    stamp(`kit version: ${checkout.version ?? "unknown"}`),
  ]);
  const [busy, setBusy] = useState(false);

  const append = (line: string) => setLog((prev) => [stamp(line), ...prev]);

  useEffect(() => {
    const completed = checkout.addEventListener("completed", (event) => {
      append(`EVENT completed — order id: ${event?.orderDetails?.id ?? "(none)"}`);
    });
    const closed = checkout.addEventListener("close", () => {
      append("EVENT close — sheet dismissed (cart should SURVIVE)");
    });
    const errored = checkout.addEventListener("error", (event) => {
      append(`EVENT error — ${JSON.stringify(event)}`);
    });
    const pixel = checkout.addEventListener("pixel", (event) => {
      const name = typeof event === "object" && event && "name" in event ? event.name : "?";
      append(`EVENT pixel — ${String(name)}`);
    });

    return () => {
      completed?.remove();
      closed?.remove();
      errored?.remove();
      pixel?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const variantId = data?.product?.variants.nodes[0]?.id;

  const start = async (lines: readonly SpikeLine[], label: string) => {
    setBusy(true);
    try {
      append(`creating cart — ${label}…`);
      const cart = await createSpikeCartWithLines(lines);
      append(`cart ${cart.id.slice(0, 48)}…`);
      append(`checkoutUrl acquired (${cart.checkoutUrl.length} chars)`);
      checkout.preload(cart.checkoutUrl);
      append("preload() called");
      checkout.present(cart.checkoutUrl);
      append("present() called");
    } catch (error) {
      append(`FAILED — ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerClassName="p-4 gap-4">
      <Stack.Screen options={{ title: "SHO-56 spike" }} />

      <Text className="text-sm text-foreground-muted">
        Creates a real cart via the Storefront API and presents Shopify checkout in
        the native sheet. Events are logged below.
      </Text>

      <Pressable
        onPress={() => variantId && start([{ merchandiseId: variantId }], "one-time")}
        disabled={busy || !variantId}
        className="rounded-lg bg-brand-600 px-4 py-3"
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-center text-base font-medium text-surface">
            {variantId ? "One-time cart → checkout" : "Loading product…"}
          </Text>
        )}
      </Pressable>

      {/* Q4: mixed one-time + Recharge subscription line. */}
      <Pressable
        onPress={() =>
          variantId &&
          start(
            [
              { merchandiseId: variantId },
              {
                merchandiseId: RECHARGE_SKI_WAX_VARIANT,
                sellingPlanId: RECHARGE_30_DAY_PLAN,
              },
            ],
            "MIXED + Recharge 30-day",
          )
        }
        disabled={busy || !variantId}
        className="rounded-lg bg-ink-800 px-4 py-3"
        accessibilityRole="button"
      >
        <Text className="text-center text-base font-medium text-surface">
          Mixed cart (one-time + subscription) → checkout
        </Text>
      </Pressable>

      <View className="gap-1">
        {log.map((line, i) => (
          <Text key={`${line}-${i}`} className="font-mono text-xs text-foreground">
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
};

export { SpikeCheckoutScreen as default };
