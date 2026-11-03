import {
  chargeDelivery,
  chargesForSubscription,
  chargeTotal,
  deliveryFrequency,
  deliveryPrice,
  formatDeliveryDate,
  subscriptionStatusLabel,
} from "@formulate/recharge";
import { formatMoney } from "@formulate/shopify";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { Text } from "../../../../components/text";
import { isRechargeConfigured } from "../../../../lib/recharge";
import { useSubscription } from "../../../../lib/use-customer";

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between gap-4 border-b border-border py-2">
    <Text className="text-sm text-foreground-muted">{label}</Text>
    <Text className="text-sm text-foreground">{value}</Text>
  </View>
);

/** One subscription, matching apps/web's /account/subscriptions/[id]. */
const SubscriptionScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSubscription(id);

  if (!isRechargeConfigured) {
    return (
      <Text className="p-4 text-foreground-muted">
        Subscriptions can&apos;t be shown in this version of the app yet.
      </Text>
    );
  }
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading this subscription" />
      </View>
    );
  }
  if (query.isError) {
    return (
      <Text accessibilityRole="alert" className="p-4 text-foreground">
        {query.error.message}
      </Text>
    );
  }
  if (!query.data) {
    return (
      <Text className="p-4 text-foreground">
        This subscription couldn&apos;t be found.
      </Text>
    );
  }

  const { subscription } = query.data;
  const price = deliveryPrice(subscription);
  const next = formatDeliveryDate(subscription.next_charge_scheduled_at);
  const upcoming = chargesForSubscription(query.data.upcoming, subscription.id);

  return (
    <ScrollView contentContainerClassName="p-4">
      <Stack.Screen options={{ title: subscription.product_title }} />
      {subscription.variant_title ? (
        <Text className="mb-2 text-foreground-muted">{subscription.variant_title}</Text>
      ) : null}

      <View className="border-t border-border">
        <Row label="Status" value={subscriptionStatusLabel(subscription.status)} />
        <Row label="Delivery" value={deliveryFrequency(subscription)} />
        <Row label="Quantity" value={String(subscription.quantity)} />
        {price ? <Row label="Price per delivery" value={formatMoney(price)} /> : null}
        {subscription.status === "active" && next ? (
          <Row label="Next delivery" value={next} />
        ) : null}
      </View>

      {upcoming.length > 0 ? (
        <View className="mt-6">
          <Text
            accessibilityRole="header"
            className="text-lg font-semibold text-foreground"
          >
            Upcoming
          </Text>
          <View className="mt-2 border-t border-border">
            {upcoming.map((charge) => {
              const delivery = chargeDelivery(charge);
              return (
                <View
                  key={charge.id}
                  className="flex-row justify-between gap-4 border-b border-border py-3"
                >
                  <View className="flex-1">
                    <Text className="text-sm text-foreground">
                      {formatDeliveryDate(charge.scheduled_at) ?? "Date to be confirmed"}
                    </Text>
                    <Text className="text-sm text-foreground-muted">
                      {Number(delivery.amount) === 0
                        ? "Free delivery"
                        : `Includes ${formatMoney(delivery)} delivery`}
                    </Text>
                  </View>
                  <Text className="font-mono text-sm text-foreground">
                    {formatMoney(chargeTotal(charge))}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text className="mt-6 text-sm text-foreground-muted">
        Changing, pausing or cancelling a subscription is coming soon. For now, use the
        link in any of our subscription emails.
      </Text>
    </ScrollView>
  );
};

export { SubscriptionScreen as default };
