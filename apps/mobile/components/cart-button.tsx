import { Pressable, Text, View } from "react-native";

import { useCart } from "../lib/use-cart";

import { useCartUi } from "./cart-provider";

/**
 * The header cart button, rendered as a Stack `headerRight`.
 *
 * Reads the same TanStack Query cache entry the sheet does, so the badge cannot
 * disagree with the contents — mutations seed that entry directly rather than
 * invalidating it, which is why there is no loading flicker on the count.
 */
export const CartButton = () => {
  const { openCart } = useCartUi();
  const { data: cart } = useCart();
  const count = cart?.totalQuantity ?? 0;

  return (
    <Pressable
      onPress={openCart}
      hitSlop={8}
      accessibilityRole="button"
      // The visible badge is a bare number, which VoiceOver would read as
      // "Cart two". This says what the number means.
      accessibilityLabel={
        count === 0
          ? "Open cart, empty"
          : `Open cart, ${count} ${count === 1 ? "item" : "items"}`
      }
      className="flex-row items-center gap-2"
    >
      <Text className="text-base text-foreground">Cart</Text>

      {count > 0 ? (
        <View
          // Excluded from the accessibility tree: the label above already
          // carries the count, and announcing it twice is worse than not at all.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5"
        >
          <Text className="text-xs font-semibold text-surface">{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
};
