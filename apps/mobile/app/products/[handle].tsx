import { formatMoney } from "@formulate/shopify";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { useProduct } from "../../lib/queries";

const ProductScreen = () => {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { data, isPending, isError, error } = useProduct(handle ?? "");

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
          Could not load this product
        </Text>
        <Text className="mt-2 text-center text-sm text-foreground-muted">
          {error.message}
        </Text>
      </View>
    );
  }

  const product = data.product;

  if (!product) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="text-base text-foreground-muted">
          Product not found.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerClassName="p-4 gap-4">
      <Stack.Screen options={{ title: product.title }} />

      <Image
        source={product.featuredImage?.url}
        contentFit="cover"
        transition={150}
        style={{ width: "100%", aspectRatio: 1, borderRadius: 12 }}
        accessibilityIgnoresInvertColors
      />

      <View>
        <Text className="text-2xl font-semibold text-foreground">
          {product.title}
        </Text>
        <Text className="mt-1 text-xl text-foreground">
          {formatMoney(product.priceRange.minVariantPrice)}
        </Text>
      </View>

      {product.description ? (
        <Text className="text-base text-foreground-muted">
          {product.description}
        </Text>
      ) : null}

      <View>
        <Text className="mb-2 text-sm font-semibold uppercase text-foreground-muted">
          Variants
        </Text>
        <View className="gap-2">
          {product.variants.nodes.map((variant) => (
            <View
              key={variant.id}
              className="flex-row items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <Text className="text-sm text-foreground">{variant.title}</Text>
              <View className="flex-row items-center gap-3">
                <Text className="text-sm text-foreground-muted">
                  {formatMoney(variant.price)}
                </Text>
                <Text
                  className={
                    variant.availableForSale
                      ? "text-sm text-success"
                      : "text-sm text-danger"
                  }
                >
                  {variant.availableForSale ? "In stock" : "Sold out"}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
};

export { ProductScreen as default };
