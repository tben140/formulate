import {
  SUBSCRIBER_GIFT,
  findVariantByOptions,
  formatMoney,
  withOption,
} from "@formulate/shopify";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";

import type { Product, Purchase } from "../lib/use-purchase";

/**
 * Variant pickers, subscribe-and-save, and add to cart.
 *
 * The state lives in `usePurchase`, owned by the product screen, because the
 * sticky bar renders the same selection (SHO-117). This component only draws
 * it. `onButtonLayout` reports where the button sits, so the screen can show
 * the bar while it is scrolled out of view.
 */
export const AddToCart = ({
  product,
  purchase,
  onAdded,
  onButtonLayout,
}: {
  readonly product: Product;
  readonly purchase: Purchase;
  readonly onAdded: () => void;
  readonly onButtonLayout?: (event: LayoutChangeEvent) => void;
}) => {
  const {
    addToCart,
    selected,
    setSelected,
    setPlanId,
    allocations,
    effectivePlanId,
    displayPrice,
    disabled,
    choices,
    label,
    add,
  } = purchase;

  return (
    // No outer margin here: the product screen measures this view's top to
    // place the button, and a margin inside it would put that 8px out.
    <View className="gap-5">
      {product.options.map((option) =>
        // A single option called "Title" with one value is Shopify's stand-in
        // for "this product has no options".
        option.optionValues.length <= 1 ? null : (
          <View key={option.name}>
            <Text className="mb-2 text-sm font-semibold text-foreground">
              {option.name}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {option.optionValues.map((value) => {
                const candidate = withOption(selected, option.name, value.name);
                const match = findVariantByOptions(product.variants.nodes, candidate);
                const checked = selected.some(
                  (o) => o.name === option.name && o.value === value.name,
                );

                return (
                  <Pressable
                    key={value.name}
                    onPress={() => setSelected(candidate)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: checked }}
                    // Sold-out combinations stay selectable — a shopper who
                    // wants one needs to select it and be told it is gone.
                    accessibilityLabel={
                      match && !match.availableForSale
                        ? `${value.name}, sold out`
                        : value.name
                    }
                    className={`rounded-md border px-3 py-2 ${
                      checked ? "border-brand-600 bg-brand-50" : "border-border"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        // Muted grey on the selected brand-50 is 4.34:1,
                        // under AA's 4.5:1: selected keeps full strength.
                        match && !match.availableForSale
                          ? `line-through ${checked ? "text-foreground" : "text-foreground-muted"}`
                          : "text-foreground"
                      } ${checked ? "font-medium" : ""}`}
                    >
                      {value.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ),
      )}

      {allocations.length > 0 ? (
        <View>
          <Text className="mb-2 text-sm font-semibold text-foreground">
            Purchase options
          </Text>
          <View className="gap-2">
            {choices.map((choice) => (
              <Pressable
                key={choice.id || "one-time"}
                onPress={() => setPlanId(choice.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: effectivePlanId === choice.id }}
                accessibilityLabel={
                  choice.price
                    ? `${choice.label}, ${formatMoney(choice.price)}`
                    : choice.label
                }
                className={`flex-row items-center justify-between rounded-md border px-3 py-3 ${
                  effectivePlanId === choice.id
                    ? "border-brand-600 bg-brand-50"
                    : "border-border"
                }`}
              >
                <Text className="text-sm text-foreground">{choice.label}</Text>
                {choice.price ? (
                  <Text
                    className={`text-sm ${
                      effectivePlanId === choice.id
                        ? "text-foreground"
                        : "text-foreground-muted"
                    }`}
                  >
                    {formatMoney(choice.price)}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
          {SUBSCRIBER_GIFT.enabled ? (
            <Text className="mt-2 text-sm text-foreground-muted">
              {SUBSCRIBER_GIFT.message}
            </Text>
          ) : null}
        </View>
      ) : null}

      {displayPrice ? (
        <Text className="text-2xl font-semibold text-foreground">
          {formatMoney(displayPrice)}
        </Text>
      ) : null}

      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={() => add(onAdded)}
        onLayout={onButtonLayout}
        className={`rounded-md px-4 py-3 ${disabled ? "bg-ink-300" : "bg-brand-600"}`}
      >
        <Text className="text-center text-sm font-semibold text-surface">{label}</Text>
      </Pressable>

      {/*
        The sheet sliding up is a visual event VoiceOver does not narrate, and
        an error here is the only thing a shopper can act on. `polite` because
        nothing here is urgent enough to interrupt.
      */}
      {addToCart.isError ? (
        <Text
          accessibilityLiveRegion="polite"
          role="alert"
          className="text-sm text-danger"
        >
          {addToCart.error.message}
        </Text>
      ) : null}

      {/*
        Fewer were added than chosen, because that is all there is. Shown in
        the neutral colour: the add worked, but the quantity is not what the
        shopper picked, so it must not read as a plain success.
      */}
      {addToCart.isSuccess && addToCart.data.notice ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-foreground">
          {addToCart.data.notice}
        </Text>
      ) : null}
    </View>
  );
};
