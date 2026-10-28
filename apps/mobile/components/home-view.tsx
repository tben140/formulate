import { Image } from "expo-image";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useCollection, useCollectionCards, useNavLinks } from "../lib/queries";
import { ProductRow } from "./product-row";
import { SiteFooter } from "./site-footer";

/** How many featured products the home screen lists before "View all". */
const FEATURED_COUNT = 4;

const LOAD_ERROR = "Could not load from Shopify";

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
  const nav = useNavLinks();
  const cardsQuery = useCollectionCards();
  const navLinks = nav.data;
  const cards = cardsQuery.data;

  const menuCollections = navLinks?.filter((link) => link.kind === "collection") ?? [];
  const featuredLink = menuCollections[0];
  const featuredQuery = useCollection(featuredLink?.handle ?? "", {
    enabled: featuredLink !== undefined,
  });
  const featuredData = featuredQuery.data;
  // The introduction always shows; what's below it comes from Shopify, so it
  // gets the same loading and error states as every other screen.
  const loading =
    nav.isPending ||
    cardsQuery.isPending ||
    (featuredLink !== undefined && featuredQuery.isPending);
  const failed = nav.isError || cardsQuery.isError || featuredQuery.isError;
  const featured = featuredData?.collection;

  // The error and its retry appear below the introduction, so a screen reader
  // is told: a live region does that on Android, and iOS needs the call.
  // Only while Home is the screen in front: it stays mounted behind Search, and
  // a late failure there would interrupt VoiceOver on another screen. On
  // coming back, an error still showing is announced then.
  useFocusEffect(
    useCallback(() => {
      if (failed && Platform.OS === "ios")
        AccessibilityInfo.announceForAccessibility(LOAD_ERROR);
    }, [failed]),
  );

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
      <View className="rounded-xl bg-surface-muted p-6">
        <Text
          accessibilityRole="header"
          className="text-3xl font-semibold text-foreground"
        >
          Everyday supplements, delivered on your schedule
        </Text>
        <Text className="mt-3 text-base text-foreground">
          Buy once or subscribe. Subscriptions can be skipped, paused or cancelled at any
          time.
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

      {failed ? (
        <View className="items-start gap-3">
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            className="text-base font-semibold text-danger"
          >
            {LOAD_ERROR}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void nav.refetch();
              void cardsQuery.refetch();
              if (featuredLink) void featuredQuery.refetch();
            }}
            className="rounded-md border border-border px-4 py-2"
          >
            <Text className="text-sm font-medium text-foreground">Try again</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <ActivityIndicator accessibilityLabel="Loading the shop" />
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
          {featured.products.nodes.slice(0, FEATURED_COUNT).map((product) => (
            <ProductRow key={product.id} product={product} />
          ))}
        </View>
      ) : null}

      <SiteFooter />
    </ScrollView>
  );
};
