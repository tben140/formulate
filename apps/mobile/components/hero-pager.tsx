import { type HeroSlide } from "@formulate/shopify";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { CampaignBadge } from "./campaign-badge";
import { CampaignEnds } from "./campaign-ends";

/**
 * The home screen's hero (SHO-203): the same slides as web and the theme, as
 * a pager that swipes a slide at a time. It doesn't move by itself: on a
 * phone the visitor's thumb sets the pace, and nothing moves under someone
 * who's reading. Previous and Next buttons do what a swipe does, for
 * VoiceOver and Switch Control. Text is foreground on brand-50 (4.35:1 for
 * muted would fail AA).
 */
export const HeroPager = ({ slides }: { readonly slides: readonly HeroSlide[] }) => {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const list = useRef<FlatList<HeroSlide>>(null);
  const count = slides.length;

  const go = (next: number) => {
    const target = (next + count) % count;
    setIndex(target);
    list.current?.scrollToIndex({ index: target, animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View
      className="overflow-hidden rounded-xl border border-brand-300 bg-brand-50"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {width > 0 ? (
        <FlatList
          ref={list}
          data={slides}
          keyExtractor={(slide) => slide.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          renderItem={({ item: slide, index: i }) => (
            <View
              style={{ width }}
              className="gap-3 p-6"
              accessibilityLabel={count > 1 ? `Slide ${i + 1} of ${count}` : undefined}
              importantForAccessibility={i === index ? "auto" : "no-hide-descendants"}
              accessibilityElementsHidden={i !== index}
            >
              {(slide.image ?? slide.mobileImage) ? (
                <Image
                  source={{ uri: (slide.mobileImage ?? slide.image)!.url }}
                  accessibilityLabel={(slide.mobileImage ?? slide.image)!.altText ?? ""}
                  style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8 }}
                  contentFit="cover"
                />
              ) : null}
              {slide.campaign ? <CampaignBadge label={slide.campaign.badge} /> : null}
              <Text
                accessibilityRole="header"
                className="text-3xl font-semibold text-foreground"
              >
                {slide.headline}
              </Text>
              {slide.text ? (
                <Text className="text-base text-foreground">{slide.text}</Text>
              ) : null}
              {slide.campaign ? (
                <CampaignEnds
                  campaign={slide.campaign}
                  className="text-sm text-foreground"
                />
              ) : null}
              {slide.href && slide.buttonLabel ? (
                <Link href={slide.href as never} asChild>
                  <Pressable
                    accessibilityRole="link"
                    className="mt-3 self-start rounded-md bg-brand-600 px-5 py-3"
                  >
                    <Text className="font-semibold text-surface">
                      {slide.buttonLabel}
                    </Text>
                  </Pressable>
                </Link>
              ) : null}
            </View>
          )}
        />
      ) : null}

      {count > 1 ? (
        <View className="flex-row items-center gap-2 px-6 pb-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            onPress={() => go(index - 1)}
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <Text className="text-sm font-medium text-foreground">Previous</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            onPress={() => go(index + 1)}
            className="rounded-md border border-border bg-surface px-3 py-1.5"
          >
            <Text className="text-sm font-medium text-foreground">Next</Text>
          </Pressable>
          <View
            className="ml-auto flex-row gap-2"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {slides.map((slide, i) => (
              <View
                key={slide.key}
                className={`h-3 w-3 rounded-full border border-brand-700 ${i === index ? "bg-brand-700" : "bg-surface"}`}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};
