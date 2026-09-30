import type { ReactNode } from "react";
import { Linking } from "react-native";

import { hasNativeSdks } from "./expo-go";

type SheetKit = typeof import("@shopify/checkout-sheet-kit");

/**
 * Checkout Sheet Kit, loaded only where it exists.
 *
 * ⚠️ It must be `require`d, not imported. The package throws at import time
 * when its native module is missing ("is not correctly linked"), and a static
 * import is evaluated before any code here can check where it is running. That
 * would crash Expo Go on launch, before the first screen renders.
 */
const sheetKit: SheetKit | null = hasNativeSdks
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("@shopify/checkout-sheet-kit") as SheetKit)
  : null;

/** The two members the app uses, typed from the kit itself so they cannot drift. */
export type Checkout = Pick<
  ReturnType<SheetKit["useShopifyCheckoutSheet"]>,
  "present" | "addEventListener"
>;

/**
 * The Expo Go stand-in: Shopify's web checkout in the system browser.
 *
 * It fires no events, because the browser tells the app nothing, so a
 * completed purchase does not clear the cart in Expo Go. That is acceptable for
 * checking screens on a phone, and it is why this path never ships: store and
 * development builds always take the native sheet.
 */
const browserCheckout: Checkout = {
  present: (checkoutUrl) => {
    void Linking.openURL(checkoutUrl);
  },
  // No events to subscribe to; callers already treat `undefined` as nothing to remove.
  addEventListener: (() => undefined) as Checkout["addEventListener"],
};

export const CheckoutProvider = ({ children }: { children: ReactNode }) => {
  if (!sheetKit) return <>{children}</>;
  const { ShopifyCheckoutSheetProvider } = sheetKit;
  return <ShopifyCheckoutSheetProvider>{children}</ShopifyCheckoutSheetProvider>;
};

/**
 * `useShopifyCheckoutSheet`, or the browser stand-in in Expo Go and on web.
 *
 * The choice is fixed for the life of the process, so the hook is called on
 * every render or on none, which keeps the rules of hooks intact.
 */
export const useCheckout: () => Checkout = sheetKit
  ? () => sheetKit.useShopifyCheckoutSheet()
  : () => browserCheckout;
