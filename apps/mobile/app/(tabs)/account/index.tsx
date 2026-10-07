import {
  formatMoney,
  formatOrderDate,
  orderPathId,
  orderStatusLabel,
} from "@formulate/shopify";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { Text } from "../../../components/text";
import {
  canPreviewAccount,
  setPreviewingAccount,
  usePreviewingAccount,
} from "../../../lib/account-preview";
import { isCustomerAccountAvailable } from "../../../lib/customer-account";
import { useCustomerOrders, useSignIn, useSignOut } from "../../../lib/use-customer";

const Button = ({
  label,
  onPress,
  busy,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "secondary";
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    accessibilityRole="button"
    accessibilityState={{ disabled: busy, busy }}
    className={`items-center rounded-md px-4 py-3 ${
      variant === "primary" ? "bg-brand-600" : "border border-border"
    } ${busy ? "opacity-60" : ""}`}
  >
    <Text
      className={`text-sm font-semibold ${
        variant === "primary" ? "text-surface" : "text-foreground"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/**
 * The Account tab (SHO-70), matching apps/web's /account: signed out, a sign-in
 * button; signed in, a greeting, the latest orders and sign out.
 *
 * Unlike web, signing in doesn't redirect away on its own: a tab you tap
 * shouldn't open a browser sheet before you've asked for it.
 */
/**
 * Expo Go can't sign in (lib/account-preview.ts), so in development it offers
 * the signed-in screens with sample data instead of a button that can't work.
 */
const ExpoGoPreviewOffer = () => (
  <View className="gap-4 p-4">
    <Text accessibilityRole="header" className="text-2xl font-semibold text-foreground">
      Your account
    </Text>
    <Text className="text-foreground-muted">
      Signing in needs the full app: Expo Go can&apos;t receive Shopify&apos;s sign-in.
      You can still try every account screen with sample data.
    </Text>
    <Button label="Preview with sample data" onPress={() => setPreviewingAccount(true)} />
  </View>
);

const AccountScreen = () => {
  const preview = usePreviewingAccount();
  const orders = useCustomerOrders();
  const signIn = useSignIn();
  const signOut = useSignOut();

  if (!preview && canPreviewAccount) return <ExpoGoPreviewOffer />;

  if (!preview && !isCustomerAccountAvailable) {
    return (
      <View className="p-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          Accounts aren&apos;t available here
        </Text>
        <Text className="mt-2 text-foreground-muted">
          Sign-in hasn&apos;t been set up in this version of the app.
        </Text>
      </View>
    );
  }

  if (orders.isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Loading your account" />
      </View>
    );
  }

  if (orders.isError) {
    return (
      <View className="gap-4 p-4">
        <Text accessibilityRole="alert" className="text-foreground">
          {orders.error.message}
        </Text>
        <Button label="Try again" onPress={() => void orders.refetch()} />
      </View>
    );
  }

  const firstPage = orders.data?.pages[0] ?? null;
  if (!firstPage) {
    const failed = signIn.data?.kind === "failed";
    return (
      <View className="gap-4 p-4">
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          Your account
        </Text>
        <Text className="text-foreground-muted">
          Sign in to see your orders. We&apos;ll email you a code, so there&apos;s no
          password to remember.
        </Text>
        {failed ? (
          <Text accessibilityRole="alert" className="text-danger">
            Sign-in didn&apos;t complete. Please try again.
          </Text>
        ) : null}
        <Button
          label={signIn.isPending ? "Signing in…" : "Sign in"}
          busy={signIn.isPending}
          onPress={() => signIn.mutate()}
        />
      </View>
    );
  }

  const { customer } = firstPage;
  const email = customer.emailAddress?.emailAddress;
  const list = orders.data.pages.flatMap((page) => page?.customer.orders.nodes ?? []);

  return (
    <ScrollView contentContainerClassName="gap-6 p-4">
      {preview ? (
        <View
          accessibilityRole="summary"
          className="rounded-md border border-brand-600 bg-brand-50 px-4 py-3"
        >
          <Text className="text-sm text-foreground">
            Preview with sample data. Nothing here is a real order or subscription.
          </Text>
        </View>
      ) : null}
      <View>
        <Text
          accessibilityRole="header"
          className="text-2xl font-semibold text-foreground"
        >
          {customer.firstName ? `Hello, ${customer.firstName}` : "Your account"}
        </Text>
        {email ? (
          <Text className="mt-1 text-foreground-muted">Signed in as {email}</Text>
        ) : null}
      </View>

      <Link href="/account/subscriptions" asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Subscriptions: your deliveries and what's coming next"
          className="flex-row items-center justify-between rounded-md border border-border px-4 py-3"
        >
          <View>
            <Text className="font-medium text-foreground">Subscriptions</Text>
            <Text className="text-sm text-foreground-muted">
              Your deliveries and what&apos;s coming next
            </Text>
          </View>
          <Text aria-hidden className="text-foreground">
            →
          </Text>
        </Pressable>
      </Link>

      <View>
        <Text
          accessibilityRole="header"
          className="text-lg font-semibold text-foreground"
        >
          Orders
        </Text>
        {list.length === 0 ? (
          <Text className="mt-2 text-foreground-muted">No orders yet.</Text>
        ) : (
          <View className="mt-2 border-t border-border">
            {list.map((order) => {
              const pathId = orderPathId(order.id);
              const status = [
                orderStatusLabel(order.financialStatus),
                orderStatusLabel(order.fulfillmentStatus),
              ]
                .filter(Boolean)
                .join(" · ");
              const row = (
                <View className="flex-row items-start justify-between gap-4 border-b border-border py-3">
                  <View className="flex-1">
                    <Text className="font-medium text-foreground">
                      Order {order.name}
                    </Text>
                    <Text className="text-sm text-foreground-muted">
                      {formatOrderDate(order.processedAt)}
                      {status ? ` · ${status}` : ""}
                    </Text>
                  </View>
                  <Text className="font-mono text-foreground">
                    {formatMoney(order.totalPrice)}
                  </Text>
                </View>
              );
              return pathId ? (
                <Link key={order.id} href={`/account/orders/${pathId}`} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Order ${order.name}, ${formatOrderDate(order.processedAt)}, ${formatMoney(order.totalPrice)}`}
                  >
                    {row}
                  </Pressable>
                </Link>
              ) : (
                <View key={order.id}>{row}</View>
              );
            })}
          </View>
        )}
        {orders.hasNextPage ? (
          <View className="mt-3">
            <Button
              label={orders.isFetchingNextPage ? "Loading…" : "Load older orders"}
              variant="secondary"
              busy={orders.isFetchingNextPage}
              onPress={() => void orders.fetchNextPage()}
            />
          </View>
        ) : null}
      </View>

      {preview ? (
        <Button
          label="Exit preview"
          variant="secondary"
          onPress={() => setPreviewingAccount(false)}
        />
      ) : (
        <Button
          label={signOut.isPending ? "Signing out…" : "Sign out"}
          variant="secondary"
          busy={signOut.isPending}
          onPress={() => signOut.mutate()}
        />
      )}
    </ScrollView>
  );
};

export { AccountScreen as default };
