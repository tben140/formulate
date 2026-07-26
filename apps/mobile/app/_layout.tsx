import { ColorScheme, ShopifyCheckoutSheetProvider } from "@shopify/checkout-sheet-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useState } from "react";

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
      {/* SPIKE (SHO-56): provider is required for useShopifyCheckoutSheet. */}
      <ShopifyCheckoutSheetProvider
        configuration={{ preloading: true, colorScheme: ColorScheme.light }}
      >
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#ffffff" },
            headerTintColor: "#0f172a",
            contentStyle: { backgroundColor: "#ffffff" },
          }}
        >
          <Stack.Screen name="index" options={{ title: "Formulate" }} />
          <Stack.Screen name="products/[handle]" options={{ title: "Product" }} />
        </Stack>
      </ShopifyCheckoutSheetProvider>
    </QueryClientProvider>
  );
};

export { RootLayout as default };
