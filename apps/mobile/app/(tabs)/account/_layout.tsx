import { Stack } from "expo-router";
import { View } from "react-native";

import { DemoNotice } from "../../../components/demo-notice";
import { fontFor } from "../../../lib/fonts";

/**
 * The Account tab's stack: the account screen, then an order. Same header and
 * demo notice as the Shop and Search stacks.
 */
const AccountStack = () => (
  <Stack
    screenLayout={({ children }) => (
      <View className="flex-1">
        <DemoNotice />
        {children}
      </View>
    )}
    screenOptions={{
      headerStyle: { backgroundColor: "#ffffff" },
      headerTitleStyle: { fontFamily: fontFor("font-semibold"), fontWeight: "normal" },
      headerTintColor: "#0f172a",
      contentStyle: { backgroundColor: "#ffffff" },
    }}
  >
    <Stack.Screen name="index" options={{ title: "Account" }} />
    <Stack.Screen name="orders/[id]" options={{ title: "Order" }} />
  </Stack>
);

export { AccountStack as default };
