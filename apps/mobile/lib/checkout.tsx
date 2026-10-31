import { useState, type ReactNode } from "react";
import { Linking, Platform, View } from "react-native";

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

/**
 * Apple Pay's merchant identifier ("merchant.com.tben140.doublehelix"), set in
 * EAS once it exists in the Apple developer account, alongside the matching
 * entitlement (app.config.ts). Without it only Shop Pay is offered.
 */
const applePayMerchantId = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID ?? "";

export const CheckoutProvider = ({ children }: { children: ReactNode }) => {
  if (!sheetKit) return <>{children}</>;
  const { ShopifyCheckoutSheetProvider, ApplePayContactField } = sheetKit;
  return (
    <ShopifyCheckoutSheetProvider
      configuration={{
        // Express checkout (ExpressCheckout below). The public Storefront
        // token needs the write_cart_wallet_payments scope for Apple Pay.
        acceleratedCheckouts: {
          storefrontDomain: process.env.EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN ?? "",
          storefrontAccessToken: process.env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? "",
          ...(applePayMerchantId
            ? {
                wallets: {
                  applePay: {
                    merchantIdentifier: applePayMerchantId,
                    contactFields: [ApplePayContactField.email],
                  },
                },
              }
            : {}),
        },
      }}
    >
      {children}
    </ShopifyCheckoutSheetProvider>
  );
};

/**
 * Shop Pay and (once configured) Apple Pay buttons: Checkout Kit's
 * accelerated checkouts. For a whole cart (`cartId`), or one product bought
 * once (`variantId` and `quantity`).
 *
 * iPhone only (iOS 16+), and only in real builds: Android has no support yet,
 * and Expo Go has no native module. Renders nothing there, and nothing if the
 * buttons fail to load (no wallet, a missing scope), so the normal checkout
 * button is never crowded by an empty space.
 *
 * ⚠️ One-time purchases only on product pages, and the cart's renewal terms
 * shown above it (packages/shopify/src/express-checkout.ts).
 */
export const ExpressCheckout = (
  props: ({ cartId: string } | { variantId: string; quantity: number }) & {
    readonly onComplete?: () => void;
  },
) => {
  const { onComplete, ...identifier } = props;
  // What failed to load, so a different cart or product tries again rather
  // than staying hidden for the life of the screen.
  const key =
    "cartId" in identifier
      ? identifier.cartId
      : `${identifier.variantId}:${identifier.quantity}`;
  const [failedFor, setFailedFor] = useState<string | null>(null);
  if (!sheetKit || Platform.OS !== "ios" || failedFor === key) return null;
  const { AcceleratedCheckoutButtons, AcceleratedCheckoutWallet, RenderState } = sheetKit;
  const wallets = [
    AcceleratedCheckoutWallet.shopPay,
    ...(applePayMerchantId ? [AcceleratedCheckoutWallet.applePay] : []),
  ];
  return (
    // A fixed height, the one the native view asks for (48pt a button, 8pt
    // between): the component starts at flex: 1 with no height and waits for
    // a resize event from iOS, and until that arrives (if it does) the buttons
    // spill out of a zero-height box over the Checkout button above.
    <View
      className="mt-2 overflow-hidden"
      style={{ height: wallets.length * 48 + (wallets.length - 1) * 8 }}
    >
      <AcceleratedCheckoutButtons
        {...identifier}
        cornerRadius={8}
        wallets={wallets}
        onComplete={() => onComplete?.()}
        onRenderStateChange={(event) => {
          if (event.state === RenderState.Error) setFailedFor(key);
        }}
      />
    </View>
  );
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
