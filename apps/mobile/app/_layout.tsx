import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { CartButton } from "../components/cart-button";
import { HeaderActions } from "../components/header-actions";
import { CartProvider } from "../components/cart-provider";
import { DemoNotice } from "../components/demo-notice";
import { CheckoutProvider } from "../lib/checkout";
import { initKlaviyo } from "../lib/klaviyo";

import "../global.css";

/*
 * Started once, at module scope rather than in an effect.
 *
 * Every other `Klaviyo.*` call is a no-op until this has run, and it fails
 * quietly rather than throwing — so initialising inside an effect would leave a
 * window where early calls vanish, which is exactly the silent-failure shape
 * this integration keeps producing. Module scope runs before any render.
 */
initKlaviyo();

const RootLayout = () => {
  // Created in state so the client survives Fast Refresh but is never shared
  // between renders of different app instances.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        Checkout Sheet Kit is a native module, so real checkout needs a
        development build. In Expo Go, CheckoutProvider renders its children
        alone and checkout opens in the browser instead (lib/checkout.tsx).

        Wrapping the whole app means the `completed` listener in CartSheet stays
        mounted for the life of the app rather than only while a particular
        screen is on top. That matters: checkout can complete while the buyer is
        anywhere, and the listener is what clears the cart.
      */}
      <CheckoutProvider>
        <CartProvider>
          <Stack
            // Wraps every screen below its native header, including screens
            // added later — so the demo notice cannot be forgotten on one.
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
              headerRight: () => <HeaderActions />,
            }}
          >
            <Stack.Screen name="index" options={{ title: "Double Helix" }} />
            <Stack.Screen name="collections/[handle]" options={{ title: "" }} />
            <Stack.Screen name="products/[handle]" options={{ title: "Product" }} />
            {/* Cart only: a Search button on the search screen goes nowhere. */}
            <Stack.Screen
              name="search"
              options={{ title: "Search", headerRight: () => <CartButton /> }}
            />
          </Stack>
        </CartProvider>
      </CheckoutProvider>
    </QueryClientProvider>
  );
};

export { RootLayout as default };
