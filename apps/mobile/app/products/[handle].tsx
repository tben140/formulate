import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { AddToCart } from "../../components/add-to-cart";
import { useCartUi } from "../../components/cart-provider";
import { SiteFooter } from "../../components/site-footer";
import { useProduct } from "../../lib/queries";

const ProductScreen = () => {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { openCart } = useCartUi();
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
        <Text className="text-base text-foreground-muted">Product not found.</Text>
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
        <Text className="text-2xl font-semibold text-foreground">{product.title}</Text>
      </View>

      {product.description ? (
        <Text className="text-base text-foreground-muted">{product.description}</Text>
      ) : null}

      {/*
        The price lives inside AddToCart, because it changes with the selection
        — a subscription plan carries its own adjusted price, and showing
        minVariantPrice alongside would contradict whatever was chosen.

        The static variant list is gone for the same reason: it listed every
        price at once next to a picker that changes the price.
      */}
      <AddToCart product={product} onAdded={openCart} />

      <SiteFooter />
    </ScrollView>
  );
};

export { ProductScreen as default };
