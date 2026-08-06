import { ShopifyCheckoutSheetProvider } from "@shopify/checkout-sheet-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";

import { CartButton } from "../components/cart-button";
import { CartProvider } from "../components/cart-provider";

import "../global.css";

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
        Checkout Sheet Kit is a native module, so this app cannot run in Expo
        Go — a development build is mandatory. It needs no config plugin;
        autolinking picks it up through `expo prebuild`.

        Wrapping the whole app means the `completed` listener in CartSheet stays
        mounted for the life of the app rather than only while a particular
        screen is on top. That matters: checkout can complete while the buyer is
        anywhere, and the listener is what clears the cart.
      */}
      <ShopifyCheckoutSheetProvider>
        <CartProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: "#ffffff" },
              headerTintColor: "#0f172a",
              contentStyle: { backgroundColor: "#ffffff" },
              headerRight: () => <CartButton />,
            }}
          >
            <Stack.Screen name="index" options={{ title: "Formulate" }} />
            <Stack.Screen name="products/[handle]" options={{ title: "Product" }} />
          </Stack>
        </CartProvider>
      </ShopifyCheckoutSheetProvider>
    </QueryClientProvider>
  );
};

export { RootLayout as default };
