import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddToCart } from "../../components/add-to-cart";
import { useCartUi } from "../../components/cart-provider";
import { SiteFooter } from "../../components/site-footer";
import { STICKY_BAR_HEIGHT, StickyAddToCart } from "../../components/sticky-add-to-cart";
import { useProduct } from "../../lib/queries";
import { usePurchase, type Product } from "../../lib/use-purchase";

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
        <Text className="text-base text-foreground-muted">Product not found.</Text>
      </View>
    );
  }

  return <ProductBody product={product} />;
};

/**
 * The loaded product page. A separate component so `usePurchase`, which needs
 * the product, is never called conditionally after the loading and error
 * returns above.
 */
const ProductBody = ({ product }: { product: Product }) => {
  const { openCart } = useCartUi();
  const { bottom } = useSafeAreaInsets();
  const purchase = usePurchase(product);

  /*
   * Where the in-page Add to cart button is, in scroll-content coordinates,
   * and which part of the content is on screen. The sticky bar shows only when
   * the button is entirely off screen, above or below: measured against the
   * button's own layout rather than a scroll threshold, because a threshold
   * breaks quietly whenever the content above it changes length (a longer
   * description, a second option row).
   */
  const [formY, setFormY] = useState(0);
  const [button, setButton] = useState<{ y: number; height: number } | null>(null);
  const [view, setView] = useState({ offset: 0, height: 0 });

  const buttonTop = formY + (button?.y ?? 0);
  const buttonOnScreen =
    button !== null &&
    buttonTop + button.height > view.offset &&
    buttonTop < view.offset + view.height;
  const showBar = button !== null && view.height > 0 && !buttonOnScreen;

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerClassName="p-4 gap-4"
        /*
          Room for the sticky bar at all times, not only while it shows, so the
          content never jumps as it appears. Without it the bar would cover the
          end of the footer.
        */
        contentContainerStyle={{ paddingBottom: STICKY_BAR_HEIGHT + bottom + 16 }}
        /*
          The footer's email field is the last thing in this view, so the
          software keyboard covers it the moment it opens. A browser scrolls a
          focused input into view for free; nothing here does.
        */
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        scrollEventThrottle={32}
        /*
          ⚠️ Read the event before calling setView. React Native recycles the
          event object once the handler returns, and the updater function runs
          later, so reading `e.nativeEvent` inside it fails on the first scroll
          ("cannot read property contentOffset").
        */
        onLayout={(e) => {
          const { height } = e.nativeEvent.layout;
          setView((v) => ({ ...v, height }));
        }}
        onScroll={(e) => {
          const offset = e.nativeEvent.contentOffset.y;
          setView((v) => ({ ...v, offset }));
        }}
      >
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
        <View onLayout={(e) => setFormY(e.nativeEvent.layout.y)}>
          <AddToCart
            product={product}
            purchase={purchase}
            onAdded={openCart}
            onButtonLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              setButton({ y, height });
            }}
          />
        </View>

        <SiteFooter />
      </ScrollView>

      {showBar ? (
        <StickyAddToCart product={product} purchase={purchase} onAdded={openCart} />
      ) : null}
    </View>
  );
};

export { ProductScreen as default };
