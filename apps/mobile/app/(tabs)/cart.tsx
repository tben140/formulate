import { useRouter } from "expo-router";
import { useEffect } from "react";

import { useCartUi } from "../../components/cart-provider";

/**
 * The Cart tab opens the cart sheet instead of navigating here (the tabPress
 * listener in app/(tabs)/_layout.tsx); Expo Router needs a route file for
 * every tab. Reached directly (a /cart link, a reload on web), it does what
 * the tab does: back to Shop, with the sheet open, rather than a blank screen.
 */
const CartTab = () => {
  const router = useRouter();
  const { openCart } = useCartUi();

  useEffect(() => {
    router.replace("/");
    openCart();
  }, [router, openCart]);

  return null;
};

export { CartTab as default };
