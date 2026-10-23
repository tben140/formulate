import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { useEffect, useState } from "react";

import { CartProvider } from "../components/cart-provider";
import { CheckoutProvider } from "../lib/checkout";
import { FONT_FILES } from "../lib/fonts";
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

// Hold the splash screen until the fonts are in (below), so text never draws
// in the system font and then jumps to DM Sans.
void SplashScreen.preventAutoHideAsync();

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

  // DM Sans and DM Mono, from the app bundle (SHO-144, lib/fonts.ts). A
  // failure falls through to the system font rather than a blank app.
  const [fontsLoaded, fontError] = useFonts(FONT_FILES);
  const fontsSettled = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (fontsSettled) void SplashScreen.hideAsync();
  }, [fontsSettled]);
  if (!fontsSettled) return null;

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
          {/*
            The tab bar is the whole app (SHO-151). Each tab has its own stack
            and header; see app/(tabs)/(shop,search)/_layout.tsx.
          */}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </CartProvider>
      </CheckoutProvider>
    </QueryClientProvider>
  );
};

export { RootLayout as default };
