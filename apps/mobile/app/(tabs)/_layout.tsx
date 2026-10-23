import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

import { useCartUi } from "../../components/cart-provider";
import { useCart } from "../../lib/use-cart";
import { fontFor } from "../../lib/fonts";

/** brand-600 and ink-500 from packages/tokens: active and inactive tabs. */
const ACTIVE = "#255deb";
const INACTIVE = "#64748b";

/** Shop opens first, as the app always has. */
export const unstable_settings = { initialRouteName: "(shop)" };

/**
 * The app's bottom tab bar (SHO-151): Shop · Search · Cart. A tab bar rather
 * than a hamburger menu, the iOS convention for top-level sections.
 *
 * Shop and Search are each a stack with its own history (see
 * (shop,search)/_layout.tsx), and tapping the tab you're on returns it to its
 * first screen. Cart isn't a screen: tapping it opens the cart sheet, as the
 * header button used to, and its badge carries the item count.
 *
 * Account and a subscriptions tab ("My plan") are expected later (SHO-70,
 * SHO-73), up to Apple's five-tab limit. Each joins when its screen exists:
 * an empty tab is worse than no tab.
 */
const TabsLayout = () => {
  const { openCart } = useCartUi();
  const { data: cart } = useCart();
  const count = cart?.totalQuantity ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        // The face carries the weight (lib/fonts.ts), so the default 500 goes.
        tabBarLabelStyle: { fontFamily: fontFor("font-medium"), fontWeight: "normal" },
        tabBarInactiveTintColor: INACTIVE,
      }}
    >
      <Tabs.Screen
        name="(shop)"
        options={{
          title: "Shop",
          // Explicit labels: the icon is a font glyph, and without one it
          // becomes the start of the tab's accessible name.
          tabBarAccessibilityLabel: "Shop",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="(search)"
        options={{
          title: "Search",
          tabBarAccessibilityLabel: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bag-outline" color={color} size={size} />
          ),
          tabBarBadge: count > 0 ? count : undefined,
          // The badge is a bare number, which VoiceOver would read as "Cart,
          // two". This says what it means.
          tabBarAccessibilityLabel:
            count === 0
              ? "Cart, empty"
              : `Cart, ${count} ${count === 1 ? "item" : "items"}`,
        }}
        listeners={{
          tabPress: (event) => {
            // Open the sheet over whichever tab is showing; never switch to the
            // placeholder screen behind this tab.
            event.preventDefault();
            openCart();
          },
        }}
      />
    </Tabs>
  );
};

export { TabsLayout as default };
