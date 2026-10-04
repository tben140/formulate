import { formatMoney } from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { View } from "react-native";

import { useComplementaryProducts } from "../lib/queries";
import { Text } from "./text";

/** How many pairings to show at most. Two are set per product today. */
const LIMIT = 3;

/**
 * "Pairs well with", from Search & Discovery's complementary products
 * (SHO-153), matching apps/web's components/pairs-well-with.tsx.
 *
 * Merchandising only: no copy suggesting a benefit of taking them together.
 * Renders nothing while loading, on failure or when there are none: a
 * suggestion beside the product should never put a spinner or an error on it.
 */
export const PairsWellWith = ({ productId }: { readonly productId: string }) => {
  const { data } = useComplementaryProducts(productId);
  const products = data?.slice(0, LIMIT) ?? [];
  if (products.length === 0) return null;

  return (
    <View className="mt-4 gap-3 border-t border-border pt-4">
      <Text
        accessibilityRole="header"
        className="text-base font-semibold text-foreground font-mono"
      >
        Pairs well with
      </Text>
      {products.map((product) => (
        <Link key={product.id} href={`/products/${product.handle}`} asChild>
          <View
            accessibilityRole="link"
            accessibilityLabel={`${product.title}, ${formatMoney(product.priceRange.minVariantPrice)}`}
            className="flex-row items-center gap-3 rounded-lg border border-border p-2"
          >
            <Image
              source={product.featuredImage?.url}
              contentFit="cover"
              transition={150}
              style={{ width: 56, height: 56, borderRadius: 8 }}
              accessibilityIgnoresInvertColors
            />
            <View className="flex-1">
              <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                {product.title}
              </Text>
              <Text className="text-sm text-foreground-muted font-mono">
                {formatMoney(product.priceRange.minVariantPrice)}
              </Text>
            </View>
          </View>
        </Link>
      ))}
    </View>
  );
};
