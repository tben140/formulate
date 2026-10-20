import { Stack } from "expo-router";
import { View } from "react-native";

import { DemoNotice } from "../../../components/demo-notice";

/**
 * One stack per tab, shared by Shop and Search (Expo Router's shared routes:
 * this folder exists once on disk but is mounted as both `(shop)` and
 * `(search)`). Each tab therefore has its own history, so a product opened
 * from Search is still there when you come back to Search, and Back on it
 * returns to the results, not to the shop.
 *
 * The two differ only in where they start: Shop on home, Search on search.
 */
export const unstable_settings = {
  initialRouteName: "index",
  search: { initialRouteName: "search" },
};

const SharedStack = ({ segment }: { readonly segment: string }) => (
  <Stack
    initialRouteName={segment === "(search)" ? "search" : "index"}
    // Wraps every screen below its native header, including screens added
    // later, so the demo notice can't be forgotten on one.
    screenLayout={({ children }) => (
      <View className="flex-1">
        <DemoNotice />
        {children}
      </View>
    )}
    screenOptions={{
      headerStyle: { backgroundColor: "#ffffff" },
      headerTintColor: "#0f172a",
      contentStyle: { backgroundColor: "#ffffff" },
    }}
  >
    <Stack.Screen name="index" options={{ title: "Formulate" }} />
    <Stack.Screen name="search" options={{ title: "Search" }} />
    <Stack.Screen name="collections/[handle]" options={{ title: "" }} />
    <Stack.Screen name="products/[handle]" options={{ title: "Product" }} />
  </Stack>
);

export { SharedStack as default };
