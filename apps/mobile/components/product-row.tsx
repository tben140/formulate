import {
  campaignBadge,
  campaignCardPrice,
  formatMoney,
  type CampaignRef,
  type MoneyLike,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { useCampaignView } from "../lib/campaign";
import { CampaignBadge } from "./campaign-badge";
import { OfferPrice, offerPriceLabel } from "./offer-price";

export type ProductRowData = {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Its campaign (SHO-169): badged only while live. */
  readonly campaign?: CampaignRef | null;
  /** For the campaign price: only the variants it covers get it. */
  readonly cardVariants?: {
    readonly nodes: readonly {
      readonly price: MoneyLike;
      readonly campaign?: CampaignRef | null;
    }[];
  };
};

/**
 * A product in a list: thumbnail, title and starting price, linking to the
 * product screen. Used by collection screens and the home screen.
 */
export const ProductRow = ({ product }: { readonly product: ProductRowData }) => {
  const view = useCampaignView();
  const badge = campaignBadge(product.campaign, view);
  const offer = campaignCardPrice(
    product.campaign,
    product.cardVariants?.nodes ?? [],
    view,
  );
  const price = offer
    ? offerPriceLabel(offer.normal, offer.offer, offer.badge)
    : formatMoney(product.priceRange.minVariantPrice);
  return (
    <Link href={`/products/${product.handle}`} asChild>
      <View
        accessibilityRole="link"
        accessibilityLabel={`${product.title}, ${price}${badge ? `, ${badge}` : ""}`}
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
          {badge ? <CampaignBadge label={badge} /> : null}
          <Text className="text-base font-medium text-foreground">{product.title}</Text>
          {offer ? (
            <View className="mt-1">
              <OfferPrice normal={offer.normal} offer={offer.offer} badge={offer.badge} />
            </View>
          ) : (
            <Text className="mt-1 text-sm text-foreground-muted">
              {formatMoney(product.priceRange.minVariantPrice)}
            </Text>
          )}
        </View>
      </View>
    </Link>
  );
};
