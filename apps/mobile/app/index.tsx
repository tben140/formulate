import { DEFAULT_COLLECTION_HANDLE, formatMoney } from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { CollectionFilters } from "../components/collection-filters";
import { SiteFooter } from "../components/site-footer";
import { useCollection } from "../lib/queries";

const CollectionScreen = () => {
  // The same filter query string web and the theme keep in the URL.
  const [filterQuery, setFilterQuery] = useState("");
  const { data, isPending, isError, error } = useCollection(
    DEFAULT_COLLECTION_HANDLE,
    filterQuery,
  );

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
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

  const collection = data.collection;

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
      data={collection.products.nodes}
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
              productCount={collection.products.nodes.length}
            />
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text className="py-12 text-center text-foreground-muted">
          No products match these filters.
        </Text>
      }
      ListFooterComponent={<SiteFooter />}
      renderItem={({ item }) => (
        <Link href={`/products/${item.handle}`} asChild>
          <View
            accessibilityRole="link"
            accessibilityLabel={`${item.title}, ${formatMoney(item.priceRange.minVariantPrice)}`}
            className="flex-row items-center gap-3 rounded-lg border border-border p-3"
          >
            <Image
              source={item.featuredImage?.url}
              contentFit="cover"
              transition={150}
              style={{ width: 64, height: 64, borderRadius: 8 }}
              accessibilityIgnoresInvertColors
            />
            <View className="flex-1">
              <Text className="text-base font-medium text-foreground">{item.title}</Text>
              <Text className="mt-1 text-sm text-foreground-muted">
                {formatMoney(item.priceRange.minVariantPrice)}
              </Text>
            </View>
          </View>
        </Link>
      )}
    />
  );
};

export { CollectionScreen as default };
