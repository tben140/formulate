import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AnalyticsConsent } from "../components/analytics-consent";
import { CartButton } from "../components/cart-button";
import { HeaderActions } from "../components/header-actions";
import { CartProvider } from "../components/cart-provider";
import { DemoNotice } from "../components/demo-notice";
import { CheckoutProvider } from "../lib/checkout";
import { initKlaviyo } from "../lib/klaviyo";
import { analytics, loadAnalyticsIdentity } from "../lib/product-analytics";
import { loadTrackingConsent, useTrackingConsent } from "../lib/tracking-consent";

import "../global.css";

/*
 * Set up once, at module scope rather than in an effect, so nothing renders
 * before the vendors are listening for the tracking choice.
 *
 * Klaviyo only starts when the choice says yes (lib/klaviyo.ts). PostHog's
 * stored id is read before the choice, so no event can mint a new id over a
 * returning shopper's (lib/product-analytics.ts). Nothing is sent by either
 * until the choice, loaded last, says yes.
 */
initKlaviyo();
void loadAnalyticsIdentity().then(loadTrackingConsent);

/** A PostHog screen view per route (SHO-87); nothing without consent. */
const AnalyticsScreens = () => {
  const pathname = usePathname();
  const consent = useTrackingConsent();
  useEffect(() => {
    analytics()?.screen(pathname);
  }, [pathname, consent]);
  return null;
};

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
            <Stack.Screen name="policies/[handle]" options={{ title: "" }} />
            {/* Cart only: a Search button on the search screen goes nowhere. */}
            <Stack.Screen
              name="search"
              options={{ title: "Search", headerRight: () => <CartButton /> }}
            />
          </Stack>
          <AnalyticsScreens />
          <AnalyticsConsent />
        </CartProvider>
      </CheckoutProvider>
    </QueryClientProvider>
  );
};

export { RootLayout as default };
