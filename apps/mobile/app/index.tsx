import { DEFAULT_COLLECTION_HANDLE, formatMoney } from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { useCollection } from "../lib/queries";

const CollectionScreen = () => {
  const { data, isPending, isError, error } = useCollection(
    DEFAULT_COLLECTION_HANDLE,
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
          {/* SPIKE (SHO-56) — remove before merge. */}
          <Link href="/spike-checkout" className="mt-3 text-sm text-brand-600">
            → SHO-56 checkout spike
          </Link>
        </View>
      }
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
              <Text className="text-base font-medium text-foreground">
                {item.title}
              </Text>
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
