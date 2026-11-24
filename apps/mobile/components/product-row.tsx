import { formatMoney, type MoneyLike } from "@formulate/shopify";
import { Link } from "expo-router";
import { View } from "react-native";
import { Text } from "./text";
import { ShopImage } from "./shop-image";

export type ProductRowData = {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
};

/**
 * A product in a list: thumbnail, title and starting price, linking to the
 * product screen. Used by collection screens and the home screen.
 */
export const ProductRow = ({ product }: { readonly product: ProductRowData }) => (
  <Link href={`/products/${product.handle}`} asChild>
    <View
      accessibilityRole="link"
      accessibilityLabel={`${product.title}, ${formatMoney(product.priceRange.minVariantPrice)}`}
      className="flex-row items-center gap-3 rounded-lg border border-border p-3"
    >
      <ShopImage
        url={product.featuredImage?.url}
        width={64}
        height={64}
        style={{ width: 64, height: 64, borderRadius: 8 }}
      />
      <View className="flex-1">
        <Text className="text-base font-medium text-foreground">{product.title}</Text>
        <Text className="mt-1 font-mono text-sm text-foreground-muted">
          {formatMoney(product.priceRange.minVariantPrice)}
        </Text>
      </View>
    </View>
  </Link>
);
