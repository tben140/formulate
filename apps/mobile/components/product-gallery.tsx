import { galleryAlt, galleryPosition, type GalleryImage } from "@formulate/shopify";
import { Image } from "expo-image";
import { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

/**
 * The product screen's images, matching apps/web's
 * components/product-gallery.tsx and the theme's <media-gallery>: one image
 * shows as before; several become a pager you swipe, one image per page, with
 * thumbnails and a position count.
 *
 * For screen readers the pager is one "adjustable" element: VoiceOver and
 * TalkBack users swipe up or down to change image, the platform convention
 * for a carousel, and hear "Image 2 of 5".
 */
export const ProductGallery = ({
  images,
  title,
}: {
  readonly images: readonly GalleryImage[];
  readonly title: string;
}) => {
  const list = useRef<FlatList<GalleryImage>>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const count = images.length;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const show = useCallback(
    (index: number) => {
      const target = (index + count) % count;
      list.current?.scrollToIndex({ index: target, animated: true });
      setActive(target);
    },
    [count],
  );

  // Read the offset now: React Native recycles the event once this returns.
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    if (width > 0)
      setActive(Math.min(Math.max(Math.round(offset / width), 0), count - 1));
  };

  if (count === 0) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="aspect-square items-center justify-center rounded-xl bg-surface-muted"
      >
        <Text className="text-sm text-foreground-muted">No image</Text>
      </View>
    );
  }

  return (
    <View onLayout={onLayout}>
      <View
        className="overflow-hidden rounded-xl bg-surface-muted"
        accessible={count > 1}
        accessibilityRole={count > 1 ? "adjustable" : undefined}
        accessibilityLabel={count > 1 ? `${title} images` : undefined}
        // Numbers as well as words: web's slider role requires them, and they
        // let a screen reader say how far through the images you are. The
        // aria- props, not accessibilityValue: React Native maps these on both
        // platforms, while react-native-web drops accessibilityValue (the
        // same lesson as aria-checked in add-to-cart.tsx, SHO-92).
        aria-valuemin={count > 1 ? 1 : undefined}
        aria-valuemax={count > 1 ? count : undefined}
        aria-valuenow={count > 1 ? active + 1 : undefined}
        aria-valuetext={count > 1 ? galleryPosition(active, count) : undefined}
        accessibilityActions={
          count > 1 ? [{ name: "increment" }, { name: "decrement" }] : undefined
        }
        onAccessibilityAction={(event) =>
          show(active + (event.nativeEvent.actionName === "increment" ? 1 : -1))
        }
      >
        {width > 0 ? (
          <FlatList
            ref={list}
            data={images}
            keyExtractor={(image) => image.url}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={count > 1}
            // Keyboard-reachable on web, where a scrollable region with nothing
            // focusable inside can't be scrolled without a mouse.
            focusable={count > 1}
            onMomentumScrollEnd={onScrollEnd}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <Image
                source={item.url}
                contentFit="cover"
                transition={150}
                // The first image is what the screen opens on; the rest load
                // when they're swiped towards.
                priority={index === 0 ? "high" : "normal"}
                style={{ width, aspectRatio: 1 }}
                // Both, as in the stack's ShopImage (SHO-92): expo-image's web
                // renderer reads `alt` only for the placeholder and labels the
                // loaded image from accessibilityLabel.
                alt={galleryAlt(item, title, index, count)}
                accessibilityLabel={galleryAlt(item, title, index, count)}
                accessibilityIgnoresInvertColors
              />
            )}
          />
        ) : (
          // Holds the square's space until the width is known.
          <View style={{ aspectRatio: 1 }} />
        )}

        {count > 1 ? (
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            className="absolute right-2 bottom-2 rounded-full bg-surface/90 px-2 py-0.5"
          >
            <Text className="font-mono text-xs text-foreground">
              {active + 1} / {count}
            </Text>
          </View>
        ) : null}
      </View>

      {count > 1 ? (
        <View className="mt-3 flex-row gap-2">
          {images.map((image, index) => (
            <Pressable
              key={image.url}
              onPress={() => show(index)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${galleryPosition(index, count).toLowerCase()}`}
              accessibilityState={{ selected: index === active }}
              hitSlop={4}
              className={`overflow-hidden rounded-md border-2 ${
                index === active ? "border-brand-600" : "border-border"
              }`}
            >
              <Image
                source={image.url}
                contentFit="cover"
                style={{ width: 56, height: 56 }}
                // Decorative: the button around it carries the label, so
                // screen readers and the web build both skip the image.
                alt=""
                accessibilityLabel=""
                accessible={false}
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};
