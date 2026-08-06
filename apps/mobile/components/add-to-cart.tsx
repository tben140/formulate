import {
  defaultSelectedOptions,
  findVariantByOptions,
  formatMoney,
  purchasableAllocations,
  withOption,
  type ProductByHandleResult,
  type SelectedOption,
} from "@formulate/shopify";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAddToCart } from "../lib/use-cart";

type Product = NonNullable<ProductByHandleResult["product"]>;

/** Sentinel for "buy it once". Not a plan id, so it is never sent. */
const ONE_TIME = "";

/**
 * Variant pickers, subscribe-and-save, and add to cart.
 *
 * The selection rules come from `packages/shopify` and are the same ones
 * apps/web renders — `findVariantByOptions`, `withOption`,
 * `purchasableAllocations`. Only the rendering differs, which is the whole
 * point of keeping them as pure functions over plain data.
 */
export const AddToCart = ({
  product,
  onAdded,
}: {
  readonly product: Product;
  readonly onAdded: () => void;
}) => {
  const addToCart = useAddToCart();

  const [selected, setSelected] = useState<readonly SelectedOption[]>(() =>
    defaultSelectedOptions(product.variants.nodes),
  );
  const [planId, setPlanId] = useState<string>(ONE_TIME);

  const variant = findVariantByOptions(product.variants.nodes, selected);

  /*
   * ⚠️ Only plans whose group is owned by an installed app.
   *
   * This store's ski wax allocates three plans to its variant and two of them
   * are Shopify seed data that nothing manages. They add to the cart and
   * complete at checkout, then never charge or ship again.
   */
  const allocations = variant
    ? purchasableAllocations(
        product.sellingPlanGroups.nodes,
        variant.sellingPlanAllocations.nodes,
      )
    : [];

  // Derived rather than reset in an effect, so moving to a variant that does
  // not offer the plan falls back to one-time without destroying the choice —
  // moving back restores it.
  const effectivePlanId = allocations.some((a) => a.sellingPlan.id === planId)
    ? planId
    : ONE_TIME;

  const chosenAllocation = allocations.find((a) => a.sellingPlan.id === effectivePlanId);
  const displayPrice =
    chosenAllocation?.priceAdjustments[0]?.price ?? variant?.price ?? null;

  const soldOut = Boolean(variant && !variant.availableForSale);
  const disabled = !variant || soldOut || addToCart.isPending;

  const choices = [
    { id: ONE_TIME, label: "One-time purchase", price: variant?.price },
    ...allocations.map((allocation) => ({
      id: allocation.sellingPlan.id,
      label: allocation.sellingPlan.name,
      price: allocation.priceAdjustments[0]?.price,
    })),
  ];

  return (
    <View className="mt-2 gap-5">
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
                        match && !match.availableForSale
                          ? "text-foreground-muted line-through"
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
                  <Text className="text-sm text-foreground-muted">
                    {formatMoney(choice.price)}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
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
        onPress={() => {
          if (!variant) return;
          addToCart.mutate(
            {
              merchandiseId: variant.id,
              quantity: 1,
              ...(effectivePlanId ? { sellingPlanId: effectivePlanId } : {}),
            },
            { onSuccess: onAdded },
          );
        }}
        className={`rounded-md px-4 py-3 ${disabled ? "bg-ink-300" : "bg-brand-600"}`}
      >
        <Text className="text-center text-sm font-semibold text-surface">
          {addToCart.isPending
            ? "Adding…"
            : soldOut
              ? "Sold out"
              : !variant
                ? "Unavailable in this combination"
                : "Add to cart"}
        </Text>
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
    </View>
  );
};
