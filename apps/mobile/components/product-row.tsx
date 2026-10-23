import {
  cardOffer,
  type CardOfferLike,
  formatMoney,
  ratingLabel,
  reviewSummary,
  type MoneyLike,
} from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { useAddToCart } from "../lib/use-cart";
import { useCartUi } from "./cart-provider";
import { Text } from "./text";
import { ShopImage } from "./shop-image";

import { Stars } from "./stars";

export type ProductRowData = CardOfferLike & {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Standard review metafields, when the query asked for them. */
  readonly rating?: { readonly value: string } | null;
  readonly ratingCount?: { readonly value: string } | null;
};

/**
 * Add a single-variant product from a list, as a one-time purchase
 * (cardOffer), then show the cart, where it can switch to Subscribe & save.
 */
const QuickAdd = ({
  variantId,
  title,
}: {
  readonly variantId: string;
  readonly title: string;
}) => {
  const addToCart = useAddToCart();
  const { openCart } = useCartUi();
  return (
    <Pressable
      onPress={() => {
        if (addToCart.isPending) return;
        addToCart.mutate(
          { merchandiseId: variantId, quantity: 1 },
          { onSuccess: openCart },
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={`Add to cart, ${title}`}
      accessibilityState={{ busy: addToCart.isPending }}
      className="min-h-11 justify-center rounded-md border border-brand-600 px-3"
    >
      <Text className="text-sm font-semibold text-brand-700">
        {addToCart.isPending ? "Adding…" : addToCart.isError ? "Try again" : "Add"}
      </Text>
    </Pressable>
  );
};

/**
 * A product in a list: thumbnail, title, rating, starting price and
 * subscription saving, linking to the product screen, with Add for a product
 * that has nothing to choose. Used by collection screens and the home screen.
 *
 * A list of rows rather than web's two-column grid: rows already show several
 * products a screen, and leave room for the button.
 */
export const ProductRow = ({ product }: { readonly product: ProductRowData }) => {
  const summary = reviewSummary(product);
  const offer = cardOffer(product);
  return (
    <View className="flex-row items-center gap-2 rounded-lg border border-border pr-3">
      <Link href={`/products/${product.handle}`} asChild>
        <View
          accessibilityRole="link"
          // One spoken label for the whole row, rating included.
          accessibilityLabel={[
            product.title,
            formatMoney(product.priceRange.minVariantPrice),
            summary ? ratingLabel(summary) : null,
            offer.subscribe,
          ]
            .filter(Boolean)
            .join(", ")}
          className="flex-1 flex-row items-center gap-3 p-3"
        >
          <ShopImage
            url={product.featuredImage?.url}
            width={64}
            height={64}
            style={{ width: 64, height: 64, borderRadius: 8 }}
          />
          <View className="flex-1">
            <Text className="text-base font-medium text-foreground">{product.title}</Text>
            {summary ? (
              <View className="mt-1 flex-row items-center gap-1">
                <Stars value={summary.average} label={ratingLabel(summary)} size={12} />
                <Text className="text-xs text-foreground-muted">({summary.count})</Text>
              </View>
            ) : null}
            <Text className="mt-1 font-mono text-sm text-foreground-muted">
              {formatMoney(product.priceRange.minVariantPrice)}
            </Text>
            {offer.subscribe ? (
              <Text className="mt-0.5 text-xs font-medium text-brand-700">
                {offer.subscribe}
              </Text>
            ) : null}
          </View>
        </View>
      </Link>
      {offer.quickAddVariantId ? (
        <QuickAdd variantId={offer.quickAddVariantId} title={product.title} />
      ) : null}
    </View>
  );
};
