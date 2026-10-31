import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { campaignFirst, campaignPath } from "@formulate/shopify";

import { useActiveCampaign } from "../lib/campaign";
import { useCollection, useCollectionCards, useNavLinks } from "../lib/queries";
import { CampaignBadge } from "./campaign-badge";
import { CampaignEnds } from "./campaign-ends";
import { ProductRow } from "./product-row";
import { SiteFooter } from "./site-footer";

/** How many featured products the home screen lists before "View all". */
const FEATURED_COUNT = 4;

/**
 * The home screen (SHO-61), matching apps/web's home page: an introduction,
 * the collections to shop by, and the featured collection's first products.
 *
 * Driven by the Shopify menu "Shop", like the web header: its collections are
 * the category cards, in menu order, and its first collection is the featured
 * one. Each part renders as soon as its own data arrives, rather than the
 * screen waiting on the slowest query.
 */
export const HomeView = () => {
  const { data: navLinks } = useNavLinks();
  const { data: cards } = useCollectionCards();
  const campaign = useActiveCampaign();

  const menuCollections = navLinks?.filter((link) => link.kind === "collection") ?? [];
  const featuredLink = menuCollections[0];
  const { data: featuredData } = useCollection(featuredLink?.handle ?? "", {
    enabled: featuredLink !== undefined,
  });
  const featured = featuredData?.collection;

  const byHandle = new Map((cards ?? []).map((card) => [card.handle, card]));
  const categories = menuCollections.flatMap((link) => {
    const card = byHandle.get(link.handle);
    return card ? [{ link, card }] : [];
  });

  return (
    <ScrollView
      contentContainerClassName="p-4 gap-8"
      // The footer's email field is last; see collection-view.tsx.
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
    >
      {campaign ? (
        // The hero while a campaign is live (SHO-169 merchandising), in place
        // of the everyday introduction, as on web and the theme. Text is
        // foreground, not foreground-muted: on brand-50 muted is 4.35:1.
        <View className="gap-3 rounded-xl border border-brand-300 bg-brand-50 p-6">
          {campaign.image ? (
            <Image
              source={{ uri: campaign.image.url }}
              accessibilityLabel={campaign.image.altText ?? ""}
              style={{
                width: "100%",
                aspectRatio:
                  campaign.image.width && campaign.image.height
                    ? campaign.image.width / campaign.image.height
                    : 16 / 9,
                borderRadius: 8,
              }}
              contentFit="cover"
            />
          ) : null}
          <CampaignBadge label={campaign.badge} />
          <Text
            accessibilityRole="header"
            className="text-3xl font-semibold text-foreground"
          >
            {campaign.headline}
          </Text>
          <Text className="text-base text-foreground">{campaign.offer}</Text>
          <CampaignEnds campaign={campaign} className="text-sm text-foreground" />
          <Link href={campaignPath(campaign.handle)} asChild>
            <Pressable
              accessibilityRole="link"
              className="mt-3 self-start rounded-md bg-brand-600 px-5 py-3"
            >
              <Text className="font-semibold text-surface">
                Shop the {campaign.badge} offer
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <View className="rounded-xl bg-surface-muted p-6">
          <Text
            accessibilityRole="header"
            className="text-3xl font-semibold text-foreground"
          >
            Everyday supplements, delivered on your schedule
          </Text>
          <Text className="mt-3 text-base text-foreground">
            Buy once or subscribe. Subscriptions can be skipped, paused or cancelled at
            any time.
          </Text>
          {featuredLink ? (
            <Link href={featuredLink.path} asChild>
              <Pressable
                accessibilityRole="link"
                className="mt-6 self-start rounded-md bg-brand-600 px-5 py-3"
              >
                <Text className="font-semibold text-surface">
                  Shop {featuredLink.title}
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      )}

      {categories.length > 0 ? (
        <View>
          <Text
            accessibilityRole="header"
            className="text-xl font-semibold text-foreground"
          >
            Shop by category
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 pt-4"
          >
            {categories.map(({ link, card }) => {
              // The collections have no image of their own, so a card
              // borrows its first product's.
              const image = card.image ?? card.products.nodes[0]?.featuredImage;
              return (
                <Link key={link.id} href={link.path} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={link.title}
                    className="w-36 overflow-hidden rounded-lg border border-border"
                  >
                    <Image
                      source={image?.url}
                      contentFit="cover"
                      transition={150}
                      style={{ width: "100%", aspectRatio: 1 }}
                      accessibilityIgnoresInvertColors
                    />
                    <Text className="p-3 text-sm font-medium text-foreground">
                      {link.title}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {featuredLink && featured && featured.products.nodes.length > 0 ? (
        <View className="gap-3">
          <View className="flex-row items-baseline justify-between">
            <Text
              accessibilityRole="header"
              className="text-xl font-semibold text-foreground"
            >
              {featured.title}
            </Text>
            <Link href={featuredLink.path} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`View all ${featured.title}`}
              >
                <Text className="text-sm text-brand-600 underline">View all</Text>
              </Pressable>
            </Link>
          </View>
          {campaignFirst(featured.products.nodes, campaign?.handle)
            .slice(0, FEATURED_COUNT)
            .map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
        </View>
      ) : null}

      <SiteFooter />
    </ScrollView>
  );
};
