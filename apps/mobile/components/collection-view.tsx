import { Stack } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { useCollectionPages } from "../lib/queries";
import { CollectionFilters } from "./collection-filters";
import { CollectionNav } from "./collection-nav";
import { ProductRow } from "./product-row";
import { SiteFooter } from "./site-footer";

/**
 * A collection's products, with the collection links from the Shopify menu
 * above them (SHO-60). Both the home screen and `/collections/[handle]` render
 * this, so they cannot drift.
 *
 * `titleInHeader` puts the collection's title in the navigation bar, for the
 * collection route. The home screen keeps "Double Helix" there.
 */
export const CollectionView = ({
  handle,
  titleInHeader = false,
  onSelectCollection,
}: {
  readonly handle: string;
  readonly titleInHeader?: boolean;
  readonly onSelectCollection?: (handle: string) => void;
}) => {
  // The same filter query string web and the theme keep in the URL.
  const [filterQuery, setFilterQuery] = useState("");
  const {
    data,
    isPending,
    isError,
    error,
    isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCollectionPages(handle, { filterQuery });
  const list = useRef<FlatList>(null);

  const selectCollection = onSelectCollection
    ? (next: string) => {
        setFilterQuery("");
        list.current?.scrollToOffset({ offset: 0, animated: false });
        onSelectCollection(next);
      }
    : undefined;

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  // Only when nothing has loaded. A failed next page keeps the products already
  // on screen (TanStack keeps `data`), and the footer offers a retry instead.
  if (isError && !data) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base font-semibold text-danger">
          Could not load from Shopify
        </Text>
        <Text className="mt-2 text-center text-sm text-foreground-muted">
          {error.message}
        </Text>
      </View>
    );
  }

  // The first page carries the collection's details and filters; every page
  // adds its products.
  const collection = data.pages[0]?.collection;
  const products = data.pages.flatMap((page) => page.collection?.products.nodes ?? []);

  if (!collection) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base text-foreground-muted">
          Collection not found, or not published to this sales channel.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={list}
      data={products}
      keyExtractor={(product) => product.id}
      contentContainerClassName="p-4 gap-3"
      /*
        The footer's email field is the last thing in this list, so the
        software keyboard covers it the moment it opens. A browser scrolls a
        focused input into view for free; nothing here does.
      */
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      ListHeaderComponent={
        <View className="mb-2">
          {titleInHeader ? <Stack.Screen options={{ title: collection.title }} /> : null}
          <CollectionNav current={handle} onSelect={selectCollection} />
          <Text className="text-2xl font-semibold text-foreground">
            {collection.title}
          </Text>
          {collection.description ? (
            <Text className="mt-1 text-sm text-foreground-muted">
              {collection.description}
            </Text>
          ) : null}
          <View className="mt-4">
            <CollectionFilters
              filters={collection.products.filters}
              query={filterQuery}
              onChange={setFilterQuery}
              productCount={products.length}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-12 text-center text-foreground-muted">
          No products match these filters.
        </Text>
      }
      // Infinite scroll (SHO-45): the next page loads as the end of the list
      // comes within half a screen. The guard stops a fast fling from asking
      // for the same page twice.
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        <>
          {isFetchingNextPage ? (
            <ActivityIndicator
              className="py-4"
              accessibilityLabel="Loading more products"
            />
          ) : isError ? (
            <View className="items-center py-4">
              <Text className="text-sm text-foreground-muted">
                {"Couldn't load more products."}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void fetchNextPage()}
                className="mt-2 rounded-md border border-border px-4 py-2"
              >
                <Text className="text-sm font-medium text-foreground">Try again</Text>
              </Pressable>
            </View>
          ) : null}
          <SiteFooter />
        </>
      }
      renderItem={({ item }) => (
        <View className={isPlaceholderData ? "opacity-50" : undefined}>
          <ProductRow product={item} />
        </View>
      )}
    />
  );
};
