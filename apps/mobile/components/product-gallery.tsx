import { galleryAlt, galleryPosition, type GalleryImage } from "@formulate/shopify";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

/** A Shopify CDN image at this width, for a thumbnail: not the original. */
const sized = (url: string, width: number): string => {
  const parsed = new URL(url);
  parsed.searchParams.set("width", String(width));
  return parsed.toString();
};

/** Slides this far either side of the one shown load their full image. */
const NEARBY = 1;

/**
 * The product screen's images, matching apps/web's
 * components/product-gallery.tsx and the theme's <media-gallery>: one image
 * shows as before; several become a pager you swipe, one image per page, with
 * thumbnails and a position count.
 *
 * For screen readers the pager is one "adjustable" element: VoiceOver and
 * TalkBack users swipe up or down to change image, the platform convention
 * for a carousel, and hear "Image 2 of 5".
 *
 * The frame takes the first image's shape, as on web and the theme, and later
 * images of another shape are centre-cropped to it.
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
  const first = images[0];
  const ratio = first?.width && first.height ? first.width / first.height : 1;
  // A product refresh can leave fewer images than the shopper had swiped
  // through, so everything below reads this clamped index, not `active`.
  const current = Math.min(active, Math.max(count - 1, 0));
  const shown = images[current];

  // A new width (rotation, a split screen) moves every page's offset, so put
  // the shown image back in view once the list has re-laid out. Only here:
  // following `active` as well would fight the shopper's swipe.
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next === width) return;
    setWidth(next);
    if (current > 0)
      requestAnimationFrame(() =>
        list.current?.scrollToIndex({ index: current, animated: false }),
      );
  };

  // Fewer images than before: bring the list's offset back to the last one,
  // which `current` already shows.
  useEffect(() => {
    if (count > 0 && active > count - 1)
      list.current?.scrollToIndex({ index: count - 1, animated: false });
  }, [active, count]);

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
        // The shown image's description too: VoiceOver doesn't reach the
        // images inside an adjustable element.
        accessibilityLabel={
          count > 1 && shown
            ? `${title} images. ${galleryAlt(shown, title, current, count)}`
            : undefined
        }
        // Numbers as well as words: web's slider role requires them, and they
        // let a screen reader say how far through the images you are. The
        // aria- props, not accessibilityValue: React Native maps these on both
        // platforms, while react-native-web drops accessibilityValue (the
        // same lesson as aria-checked in add-to-cart.tsx, SHO-92).
        aria-valuemin={count > 1 ? 1 : undefined}
        aria-valuemax={count > 1 ? count : undefined}
        aria-valuenow={count > 1 ? current + 1 : undefined}
        aria-valuetext={count > 1 ? galleryPosition(current, count) : undefined}
        accessibilityActions={
          count > 1 ? [{ name: "increment" }, { name: "decrement" }] : undefined
        }
        onAccessibilityAction={(event) =>
          show(current + (event.nativeEvent.actionName === "increment" ? 1 : -1))
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
            // One page at first, then its neighbours: not all ten at once.
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            renderItem={({ item, index }) => (
              <Image
                // Pages further away keep their space but load nothing yet.
                source={Math.abs(index - current) <= NEARBY ? item.url : undefined}
                contentFit="cover"
                contentPosition="center"
                transition={150}
                // The first image is what the screen opens on; the rest load
                // when they're swiped towards.
                priority={index === 0 ? "high" : "normal"}
                style={{ width, aspectRatio: ratio }}
                // With one image there's no adjustable wrapper, so the image
                // itself is what VoiceOver focuses.
                accessible={count === 1}
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
          // Holds the frame's space until the width is known.
          <View style={{ aspectRatio: ratio }} />
        )}

        {count > 1 ? (
          <View
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            className="absolute right-2 bottom-2 rounded-full bg-surface/90 px-2 py-0.5"
          >
            <Text className="font-mono text-xs text-foreground">
              {current + 1} / {count}
            </Text>
          </View>
        ) : null}
      </View>

      {count > 1 ? (
        // Scrolls sideways: six or more thumbnails are wider than a phone.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-3"
          contentContainerClassName="gap-2"
        >
          {images.map((image, index) => (
            <Pressable
              key={image.url}
              onPress={() => show(index)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${galleryPosition(index, count).toLowerCase()}`}
              accessibilityState={{ selected: index === current }}
              hitSlop={4}
              className={`overflow-hidden rounded-md border-2 ${
                index === current ? "border-brand-600" : "border-border"
              }`}
            >
              <Image
                // Three times its 56pt, for the sharpest screens.
                source={sized(image.url, 168)}
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
        </ScrollView>
      ) : null}
    </View>
  );
};
