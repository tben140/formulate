import {
  EVENTS,
  PRODUCT_EVENTS,
  addedToCart,
  addedToCartProperties,
} from "@formulate/analytics";
import { formatMoney, type Cart, type CartSuggestion } from "@formulate/shopify";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { trackEvent } from "../lib/klaviyo";
import { analytics } from "../lib/product-analytics";
import { useCartSuggestions } from "../lib/queries";
import { SITE_ORIGIN } from "../lib/site";
import { useAddToCart } from "../lib/use-cart";

import { Text } from "./text";

/**
 * "You might also like", in the cart sheet (SHO-116), matching apps/web's
 * components/cart-suggestions.tsx and the theme's cart-recommendations
 * section. Which products appear is `selectCartSuggestions` in
 * packages/shopify, the rule all three share.
 *
 * Renders nothing while loading, on failure, or with nothing to suggest: no
 * heading over an empty gap, and never a spinner or error inside the cart.
 */
export const CartSuggestions = ({
  cart,
  onOpenProduct,
}: {
  readonly cart: Cart | null | undefined;
  /** Closes the sheet: a product page opens behind it otherwise. */
  readonly onOpenProduct: () => void;
}) => {
  const { data: suggestions = [] } = useCartSuggestions(cart);
  if (suggestions.length === 0) return null;

  return (
    <View className="gap-3 px-4 py-4">
      <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
        You might also like
      </Text>
      {suggestions.map((suggestion) => (
        <Suggestion
          key={suggestion.product.id}
          suggestion={suggestion}
          onOpenProduct={onOpenProduct}
        />
      ))}
    </View>
  );
};

const Suggestion = ({
  suggestion,
  onOpenProduct,
}: {
  readonly suggestion: CartSuggestion;
  readonly onOpenProduct: () => void;
}) => {
  const { product } = suggestion;
  const router = useRouter();
  const addToCart = useAddToCart();
  const price = formatMoney(product.priceRange.minVariantPrice);

  const add = (variantId: string) =>
    addToCart.mutate(
      { merchandiseId: variantId, quantity: 1 },
      {
        // The same events as the product screen's add (lib/use-purchase.ts),
        // so an add from here counts as an add.
        onSuccess: ({ cart, notice }) => {
          if (notice) return;
          const line = cart.lines.nodes.find(
            (l) =>
              "id" in l.merchandise &&
              l.merchandise.id === variantId &&
              !l.sellingPlanAllocation,
          );
          const added = line ? addedToCartProperties(line, 1) : null;
          if (added) analytics()?.capture(PRODUCT_EVENTS.addedToCart, added);
          if (line && "product" in line.merchandise)
            trackEvent(EVENTS.addedToCart, addedToCart(cart, line, SITE_ORIGIN, 1));
        },
      },
    );

  return (
    <View className="flex-row items-center gap-3">
      <Image
        source={product.featuredImage?.url}
        contentFit="cover"
        style={{ width: 48, height: 48, borderRadius: 8 }}
        accessibilityIgnoresInvertColors
      />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm text-foreground">
          {product.title}
        </Text>
        <Text className="text-xs text-foreground-muted font-mono">{price}</Text>
        {addToCart.isError ? (
          <Text accessibilityRole="alert" className="text-xs text-danger">
            {addToCart.error.message}
          </Text>
        ) : null}
      </View>

      {suggestion.kind === "add" ? (
        <Pressable
          onPress={() => {
            if (!addToCart.isPending) add(suggestion.variantId);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Add ${product.title}, ${price}`}
          accessibilityState={{ busy: addToCart.isPending }}
          hitSlop={8}
          className={`rounded-md border border-border px-3 py-1.5 ${addToCart.isPending ? "opacity-60" : ""}`}
        >
          <Text className="text-sm font-medium text-foreground">
            {addToCart.isPending ? "Adding…" : "Add"}
          </Text>
        </Pressable>
      ) : (
        // Several variants: the shopper chooses on the product page.
        <Pressable
          onPress={() => {
            onOpenProduct();
            router.push(`/products/${product.handle}`);
          }}
          accessibilityRole="link"
          accessibilityLabel={`View ${product.title}, ${price}`}
          hitSlop={8}
          className="rounded-md border border-border px-3 py-1.5"
        >
          <Text className="text-sm font-medium text-foreground">View</Text>
        </Pressable>
      )}
    </View>
  );
};
