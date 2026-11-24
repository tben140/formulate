import {
  formatMoney,
  ratingLabel,
  reviewSummary,
  type MoneyLike,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { Stars } from "./stars";

export type ProductRowData = {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Standard review metafields, when the query asked for them. */
  readonly rating?: { readonly value: string } | null;
  readonly ratingCount?: { readonly value: string } | null;
};

/**
 * A product in a list: thumbnail, title and starting price, linking to the
 * product screen. Used by collection screens and the home screen.
 */
export const ProductRow = ({ product }: { readonly product: ProductRowData }) => {
  const summary = reviewSummary(product);
  return (
    <Link href={`/products/${product.handle}`} asChild>
      <View
        accessibilityRole="link"
        // One spoken label for the whole row, rating included.
        accessibilityLabel={[
          product.title,
          formatMoney(product.priceRange.minVariantPrice),
          summary ? ratingLabel(summary) : null,
        ]
          .filter(Boolean)
          .join(", ")}
        className="flex-row items-center gap-3 rounded-lg border border-border p-3"
      >
        <Image
          source={product.featuredImage?.url}
          contentFit="cover"
          transition={150}
          style={{ width: 64, height: 64, borderRadius: 8 }}
          accessibilityIgnoresInvertColors
        />
        <View className="flex-1">
          <Text className="text-base font-medium text-foreground">{product.title}</Text>
          {summary ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Stars value={summary.average} label={ratingLabel(summary)} size={12} />
              <Text className="text-xs text-foreground-muted">({summary.count})</Text>
            </View>
          ) : null}
          <Text className="mt-1 text-sm text-foreground-muted">
            {formatMoney(product.priceRange.minVariantPrice)}
          </Text>
        </View>
      </View>
    </Link>
  );
};
