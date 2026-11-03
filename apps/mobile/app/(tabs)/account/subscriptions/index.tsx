import {
  chargeDelivery,
  chargeTotal,
  deliveryFrequency,
  deliveryPrice,
  formatDeliveryDate,
  subscriptionStatusLabel,
} from "@formulate/recharge";
import { formatMoney } from "@formulate/shopify";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "../../../../components/text";
import { isCustomerAccountAvailable } from "../../../../lib/customer-account";
import { usePreviewingAccount } from "../../../../lib/account-preview";
import { isRechargeConfigured } from "../../../../lib/recharge";
import { useHasCustomerSession, usePortal } from "../../../../lib/use-customer";

const Message = ({ children, alert }: { children: string; alert?: boolean }) => (
  <Text
    accessibilityRole={alert ? "alert" : undefined}
    className="p-4 text-foreground-muted"
  >
    {children}
  </Text>
);

/**
 * The subscription portal in the app, read-only (SHO-72), matching apps/web's
 * /account/subscriptions: next deliveries, then each subscription.
 */
const SubscriptionsScreen = () => {
  const preview = usePreviewingAccount();
  const session = useHasCustomerSession();
  const portal = usePortal();

  if (!preview && (!isCustomerAccountAvailable || !isRechargeConfigured)) {
    return (
      <Message>Subscriptions can&apos;t be shown in this version of the app yet.</Message>
    );
  }
  if (session.data === false) {
    return <Message>Sign in on the Account tab to see your subscriptions.</Message>;
  }
  if (portal.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading your subscriptions" />
      </View>
    );
  }
  if (portal.isError) return <Message alert>{portal.error.message}</Message>;

  const { subscriptions, upcoming } = portal.data;
  if (subscriptions.length === 0) {
    return (
      <Message>
        You don&apos;t have any subscriptions yet. Choose &ldquo;Subscribe&rdquo; on a
        product to have it delivered on a schedule, for less.
      </Message>
    );
  }

  return (
    <ScrollView contentContainerClassName="gap-6 p-4">
      <View>
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Next deliveries
        </Text>
        {upcoming.length === 0 ? (
          <Text className="mt-2 text-foreground-muted">Nothing is scheduled.</Text>
        ) : (
          <View className="mt-2 border-t border-border">
            {upcoming.map((charge) => {
              const delivery = chargeDelivery(charge);
              return (
                <View
                  key={charge.id}
                  className="flex-row justify-between gap-4 border-b border-border py-3"
                >
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">
                      {formatDeliveryDate(charge.scheduled_at) ?? "Date to be confirmed"}
                    </Text>
                    <Text className="text-sm text-foreground-muted">
                      {charge.line_items
                        .map((line) => `${line.quantity} × ${line.title}`)
                        .join(", ")}
                      {" · "}
                      {Number(delivery.amount) === 0
                        ? "Free delivery"
                        : `Delivery ${formatMoney(delivery)}`}
                    </Text>
                  </View>
                  <Text className="font-mono text-foreground">
                    {formatMoney(chargeTotal(charge))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View>
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Subscriptions
        </Text>
        <View className="mt-2 border-t border-border">
          {subscriptions.map((subscription) => {
            const price = deliveryPrice(subscription);
            const next = formatDeliveryDate(subscription.next_charge_scheduled_at);
            const detail = [
              subscriptionStatusLabel(subscription.status),
              deliveryFrequency(subscription),
              subscription.status === "active" && next ? `Next ${next}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const title = `${subscription.quantity > 1 ? `${subscription.quantity} × ` : ""}${
              subscription.product_title
            }${subscription.variant_title ? ` (${subscription.variant_title})` : ""}`;
            return (
              <Link
                key={subscription.id}
                href={`/account/subscriptions/${subscription.id}`}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${title}, ${detail}${price ? `, ${formatMoney(price)}` : ""}`}
                  className="flex-row justify-between gap-4 border-b border-border py-3"
                >
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">{title}</Text>
                    <Text className="text-sm text-foreground-muted">{detail}</Text>
                  </View>
                  {price ? (
                    <Text className="font-mono text-foreground">
                      {formatMoney(price)}
                    </Text>
                  ) : null}
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
};

export { SubscriptionsScreen as default };
