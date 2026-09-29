import { formatMoney } from "@formulate/shopify";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Product, Purchase } from "../lib/use-purchase";

/**
 * The product screen's add-to-cart bar, pinned to the bottom while the
 * in-page button is scrolled out of view (SHO-117). Web and the theme have the
 * same bar.
 *
 * It draws the same `usePurchase` state as `AddToCart`, never a copy, so the
 * selected option, price and sold-out state always match the form.
 *
 * Unmounted rather than hidden when not needed: a hidden-but-mounted button
 * would still be reachable by VoiceOver, and two "Add to cart" buttons in a
 * row are confusing. The screen pads its content by `STICKY_BAR_HEIGHT` so the
 * bar never covers the last lines of the page.
 *
 * No entry animation: it appears on the same frame the button leaves, which
 * also means there is no motion to reduce.
 */
export const STICKY_BAR_HEIGHT = 72;

export const StickyAddToCart = ({
  product,
  purchase,
  onAdded,
}: {
  readonly product: Product;
  readonly purchase: Purchase;
  readonly onAdded: () => void;
}) => {
  const { bottom } = useSafeAreaInsets();
  const { variant, displayPrice, disabled, label, add } = purchase;

  // Shopify's placeholder for a product with no real options.
  const variantTitle =
    variant && variant.title !== "Default Title" ? variant.title : null;

  return (
    <View
      className="absolute inset-x-0 bottom-0 flex-row items-center gap-3 border-t border-border bg-surface px-4 pt-3"
      style={{ paddingBottom: Math.max(bottom, 12) }}
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-medium text-foreground">
          {variantTitle ?? product.title}
        </Text>
        {displayPrice ? (
          <Text className="text-sm text-foreground-muted">{formatMoney(displayPrice)}</Text>
        ) : null}
      </View>

      <Pressable
        disabled={disabled}
        onPress={() => add(onAdded)}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        // Distinct from the in-page button, so a screen reader's list of
        // buttons does not show two identical "Add to cart" entries.
        accessibilityLabel={
          label === "Add to cart"
            ? `Add ${product.title}${variantTitle ? `, ${variantTitle},` : ""} to cart`
            : label
        }
        accessibilityHint="Quick add from the bar at the bottom of the screen"
        className={`rounded-md px-5 py-3 ${disabled ? "bg-ink-300" : "bg-brand-600"}`}
      >
        <Text className="text-sm font-semibold text-surface">{label}</Text>
      </Pressable>
    </View>
  );
};
