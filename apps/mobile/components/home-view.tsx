import {
  HOME_HEADLINE,
  cardOffer,
  homeBenefits,
  homeSubheading,
} from "@formulate/shopify";
import { Link } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";

import { useCollection, useCollectionCards, useNavLinks } from "../lib/queries";
import { ProductRow } from "./product-row";
import { SiteFooter } from "./site-footer";
import { Text } from "./text";
import { ShopImage } from "./shop-image";

/** How many featured products the home screen lists before "View all". */
const FEATURED_COUNT = 4;

/**
 * The home screen (SHO-61), matching apps/web's home page: the offer, its
 * benefits, the featured collection's first products, the collections to shop
 * by, and the quiz. Words shared with web (packages/shopify/src/home.ts); the
 * saving is read from a featured product's plan. A page builder for web and
 * the app is planned; until then this screen is code.
 *
 * Driven by the Shopify menu "Shop", like the web header: its collections are
 * the category cards, in menu order, and its first collection is the featured
 * one. Each part renders as soon as its own data arrives, rather than the
 * screen waiting on the slowest query.
 */
export const HomeView = () => {
  const { data: navLinks } = useNavLinks();
  const { data: cards } = useCollectionCards();

  const menuCollections = navLinks?.filter((link) => link.kind === "collection") ?? [];
  const featuredLink = menuCollections[0];
  const { data: featuredData } = useCollection(featuredLink?.handle ?? "", {
    enabled: featuredLink !== undefined,
  });
  const featured = featuredData?.collection;

  const products = featured?.products.nodes.slice(0, FEATURED_COUNT) ?? [];
  const savingPercent =
    products.map((product) => cardOffer(product).savingPercent).find(Boolean) ?? null;
  const heroImage = products.find((product) => product.featuredImage)?.featuredImage;

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
      // Sign up takes one tap with the keyboard up; see collection-view.tsx.
      keyboardShouldPersistTaps="handled"
    >
      <View className="rounded-xl bg-surface-muted p-6">
        <Text
          accessibilityRole="header"
          className="text-3xl font-semibold text-foreground"
        >
          {HOME_HEADLINE}
        </Text>
        <Text className="mt-3 text-base text-foreground">
          {homeSubheading(savingPercent)}
        </Text>
        <View className="mt-6 flex-row flex-wrap gap-3">
          {featuredLink ? (
            <Link href={featuredLink.path} asChild>
              <Pressable
                accessibilityRole="link"
                className="rounded-md bg-brand-600 px-5 py-3"
              >
                <Text className="font-semibold text-surface">
                  Shop {featuredLink.title}
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
        {heroImage ? (
          <ShopImage
            url={heroImage.url}
            width={200}
            height={200}
            style={{
              width: 200,
              height: 200,
              borderRadius: 12,
              alignSelf: "center",
              marginTop: 24,
            }}
          />
        ) : null}
      </View>

      <View
        accessibilityRole="list"
        accessibilityLabel="Why Double Helix"
        className="flex-row flex-wrap gap-2"
      >
        {homeBenefits(savingPercent).map((benefit) => (
          <View
            key={benefit}
            className="w-[48%] flex-row gap-2 rounded-lg border border-border p-3"
          >
            <Text
              className="font-semibold text-brand-600"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              ✓
            </Text>
            <Text className="flex-1 text-sm text-foreground">{benefit}</Text>
          </View>
        ))}
      </View>

      {featuredLink && featured && products.length > 0 ? (
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
          {products.map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </View>
      ) : null}

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
                    {/* The card is w-36: 144 pt square. */}
                    <ShopImage
                      url={image?.url}
                      width={144}
                      height={144}
                      style={{ width: "100%", aspectRatio: 1 }}
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

      <SiteFooter />
    </ScrollView>
  );
};
