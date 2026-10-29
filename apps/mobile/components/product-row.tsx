import {
  campaignBadge,
  formatMoney,
  type CampaignRef,
  type MoneyLike,
} from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { Text, View } from "react-native";

import { campaignClock } from "../lib/campaign";
import { CampaignBadge } from "./campaign-badge";

export type ProductRowData = {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  /** Its campaign (SHO-169): badged only while live. */
  readonly campaign?: CampaignRef | null;
};

/**
 * A product in a list: thumbnail, title and starting price, linking to the
 * product screen. Used by collection screens and the home screen.
 */
export const ProductRow = ({ product }: { readonly product: ProductRowData }) => {
  const badge = campaignBadge(product.campaign, campaignClock());
  return (
    <Link href={`/products/${product.handle}`} asChild>
      <View
        accessibilityRole="link"
        accessibilityLabel={`${product.title}, ${formatMoney(product.priceRange.minVariantPrice)}${badge ? `, ${badge}` : ""}`}
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
          <Text className="mt-1 text-sm text-foreground-muted">
            {formatMoney(product.priceRange.minVariantPrice)}
          </Text>
        </View>
      </View>
    </Link>
  );
};
