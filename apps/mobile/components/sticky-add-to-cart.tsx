import { formatMoney } from "@formulate/shopify";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Product, Purchase } from "../lib/use-purchase";

/**
 * The product screen's add-to-cart bar, pinned to the bottom while the
 * in-page button is scrolled out of view (SHO-117). Web and the theme have the
 * same bar.
 *
 * It draws the same `usePurchase` state as `AddToCart`, never a copy, so the
 * selected option, price and sold-out state always match the form.
 *
 * It slides up and fades in, and back out, on the native thread
 * (`useNativeDriver`), so scrolling stays smooth while it moves. With the
 * system's Reduce Motion setting on, it appears and disappears instantly.
 *
 * While it is leaving it is already hidden from VoiceOver and ignores touches,
 * and once the animation ends it unmounts. So a screen reader never reaches a
 * bar that is on its way out, and never finds two "Add to cart" buttons in a
 * row. The screen pads its content by `STICKY_BAR_HEIGHT` so the bar never
 * covers the last lines of the page.
 */
export const STICKY_BAR_HEIGHT = 72;

const DURATION_MS = 220;

/** The system Reduce Motion setting, kept current if it changes mid-session. */
const useReduceMotion = () => {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduce;
};

export const StickyAddToCart = ({
  product,
  purchase,
  visible,
  onAdded,
}: {
  readonly product: Product;
  readonly purchase: Purchase;
  readonly visible: boolean;
  readonly onAdded: () => void;
}) => {
  const { bottom } = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { variant, displayPrice, disabled, label, add } = purchase;

  // 0 = off screen below, 1 = in place. Starts where `visible` says, so the
  // first render never animates. Held in state rather than a ref, so render
  // can read it (an Animated.Value is mutated natively, not by React).
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  /*
   * `gone` is true once the exit animation has finished. The bar renders while
   * it is visible or still leaving. Showing it again clears `gone` during
   * render, React's pattern for state that follows a prop, rather than in an
   * effect, which would render it once more in the old state first.
   */
  const [gone, setGone] = useState(!visible);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setGone(false);
  }

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : DURATION_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      // Only unmount once fully gone. A reversal part-way through stops this
      // animation with finished=false, so the bar stays.
      if (finished && !visible) setGone(true);
    });

    return () => animation.stop();
  }, [visible, reduceMotion, progress]);

  if (!visible && gone) return null;

  // Shopify's placeholder for a product with no real options.
  const variantTitle =
    variant && variant.title !== "Default Title" ? variant.title : null;

  const travel = STICKY_BAR_HEIGHT + bottom;

  return (
    /*
      Animated.View carries only the position and the animation; the styling
      stays on a plain View inside, where NativeWind's className is reliable.
    */
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [travel, 0],
            }),
          },
        ],
      }}
    >
      <View
        className="flex-row items-center gap-3 border-t border-border bg-surface px-4 pt-3"
        style={{ paddingBottom: Math.max(bottom, 12) }}
      >
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-foreground">
            {variantTitle ?? product.title}
          </Text>
          {displayPrice ? (
            <Text className="text-sm text-foreground-muted">{formatMoney(displayPrice)}</Text>
          ) : null}
        </View>

        <Pressable
          disabled={disabled}
          onPress={() => add(onAdded)}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          // Distinct from the in-page button, so a screen reader's list of
          // buttons does not show two identical "Add to cart" entries.
          accessibilityLabel={
            label === "Add to cart"
              ? `Add ${product.title}${variantTitle ? `, ${variantTitle},` : ""} to cart`
              : label
          }
          accessibilityHint="Quick add from the bar at the bottom of the screen"
          className={`rounded-md px-5 py-3 ${disabled ? "bg-ink-300" : "bg-brand-600"}`}
        >
          <Text className="text-sm font-semibold text-surface">{label}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};
