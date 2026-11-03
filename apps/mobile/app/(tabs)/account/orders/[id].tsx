import {
  formatMoney,
  formatOrderDate,
  orderStatusLabel,
  type MoneyLike,
} from "@formulate/shopify";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, View } from "react-native";

import { Text } from "../../../../components/text";
import { useCustomerOrder } from "../../../../lib/use-customer";

const TotalRow = ({
  label,
  money,
  strong,
}: {
  label: string;
  money: MoneyLike | null;
  strong?: boolean;
}) =>
  money ? (
    <View className="flex-row justify-between py-1">
      <Text className={`text-sm text-foreground ${strong ? "font-semibold" : ""}`}>
        {label}
      </Text>
      <Text
        className={`font-mono text-sm text-foreground ${strong ? "font-medium" : ""}`}
      >
        {formatMoney(money)}
      </Text>
    </View>
  ) : null;

/**
 * One order, matching apps/web's /account/orders/[id]. Signed out, or an id
 * that isn't this buyer's, reads as "not found": saying "not yours" would
 * confirm the order exists.
 */
const OrderScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useCustomerOrder(id);

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading your order" />
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

  const order = query.data?.order;
  if (!order) {
    return (
      <Text className="p-4 text-foreground">This order couldn&apos;t be found.</Text>
    );
  }

  const status = [
    orderStatusLabel(order.financialStatus),
    orderStatusLabel(order.fulfillmentStatus),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView contentContainerClassName="p-4">
      <Stack.Screen options={{ title: `Order ${order.name}` }} />
      <Text className="text-foreground-muted">
        Placed {formatOrderDate(order.processedAt)}
        {status ? ` · ${status}` : ""}
      </Text>

      <View className="mt-4 border-t border-border">
        {order.lineItems.nodes.map((line) => (
          <View
            key={line.id}
            className="flex-row justify-between gap-4 border-b border-border py-3"
          >
            <View className="flex-1">
              <Text className="font-medium text-foreground">{line.title}</Text>
              <Text className="text-sm text-foreground-muted">
                {line.variantTitle ? `${line.variantTitle} · ` : ""}Quantity{" "}
                {line.quantity}
              </Text>
            </View>
            {line.totalPrice ? (
              <Text className="font-mono text-foreground">
                {formatMoney(line.totalPrice)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View className="mt-4">
        <TotalRow label="Subtotal" money={order.subtotal} />
        <TotalRow label="Delivery" money={order.totalShipping} />
        <TotalRow label="Tax" money={order.totalTax} />
        <TotalRow label="Total" money={order.totalPrice} strong />
      </View>
    </ScrollView>
  );
};

export { OrderScreen as default };
