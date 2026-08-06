import { formatMoney } from "@formulate/shopify";
import { useShopifyCheckoutSheet } from "@shopify/checkout-sheet-kit";
import { Image } from "expo-image";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useCart, useClearCart, useUpdateCartLine } from "../lib/use-cart";

/**
 * The cart, as a bottom sheet.
 *
 * A native `<Modal presentationStyle="pageSheet">` rather than a gesture
 * library. It is the real UIKit sheet — drag to dismiss, the rounded card
 * inset from the top, the correct behaviour when the keyboard appears — and it
 * needs no additional native module on top of Checkout Sheet Kit.
 *
 * Why a sheet rather than the side drawer web and the theme use: sliding in
 * from the right is a web idiom. On iOS the same *role* is filled by a sheet,
 * and copying the web's geometry would make the app read as a ported website.
 * Design parity is the design system, not the geometry — see
 * docs/adr/0005-parity-means-design-not-data.md.
 *
 * ⚠️ Shopify's checkout also presents as a sheet, so the two stack. That is
 * fine visually — ours is native and theirs is a full-bleed branded web
 * checkout — but it makes the dismissal rule below load-bearing.
 */
export const CartSheet = ({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) => {
  const { data: cart, isPending } = useCart();
  const updateLine = useUpdateCartLine();
  const clearCart = useClearCart();
  const checkout = useShopifyCheckoutSheet();

  useEffect(() => {
    /*
     * Verified ordering from the SHO-56 spike:
     *
     *   14:54:27  completed  — carries the order id
     *   14:55:41  close      — when the buyer dismisses the confirmation
     *
     * `close` fires AFTER `completed`, so clearing on `close` would undo a
     * correct clear. Everything here hangs off `completed`.
     *
     * Closing our own sheet here too is what stops the buyer landing back in a
     * cart after a successful purchase. Shopify's checkout sheet is presented
     * over ours; when it dismisses, whatever is underneath becomes visible
     * again. An empty cart is a dead end — the storefront is not.
     */
    const completed = checkout.addEventListener("completed", () => {
      clearCart.mutate();
      onClose();
    });

    const errored = checkout.addEventListener("error", () => {
      // The cart is deliberately left intact. A failed checkout is not a
      // completed one, and discarding what the buyer assembled would be the
      // worst possible response to a payment problem.
      onClose();
    });

    return () => {
      completed?.remove();
      errored?.remove();
    };
    // `clearCart` and `checkout` are stable for the life of the component;
    // including them would re-subscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const lines = cart?.lines.nodes ?? [];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      // Swipe-to-dismiss and the hardware back button both route here, so
      // React state can never drift from what is actually on screen.
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-surface">
        <View className="flex-row items-center justify-between border-b border-border px-4 py-4">
          <Text className="text-lg font-semibold text-foreground">
            Cart
            {cart?.totalQuantity ? (
              <Text className="text-sm font-normal text-foreground-muted">
                {"  "}
                {cart.totalQuantity} {cart.totalQuantity === 1 ? "item" : "items"}
              </Text>
            ) : null}
          </Text>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close cart"
            hitSlop={8}
          >
            <Text className="text-sm text-foreground-muted">Close</Text>
          </Pressable>
        </View>

        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : lines.length === 0 ? (
          <Text className="p-8 text-sm text-foreground-muted">Your cart is empty.</Text>
        ) : (
          <ScrollView contentContainerClassName="pb-4">
            {lines.map((line) => {
              const variant = line.merchandise;

              return (
                <View
                  key={line.id}
                  className="flex-row gap-3 border-b border-border px-4 py-4"
                >
                  {variant.image ? (
                    <Image
                      source={variant.image.url}
                      contentFit="cover"
                      style={{ width: 64, height: 64, borderRadius: 8 }}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}

                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      {variant.product.title}
                    </Text>

                    {variant.title !== "Default Title" ? (
                      <Text className="text-xs text-foreground-muted">
                        {variant.title}
                      </Text>
                    ) : null}

                    {/*
                      The subscription line. This is how a buyer confirms they
                      bought a subscription rather than a one-off, and the whole
                      reason the selling-plan filter exists.
                    */}
                    {line.sellingPlanAllocation ? (
                      <Text className="mt-0.5 text-xs font-medium text-brand-600">
                        {line.sellingPlanAllocation.sellingPlan.name}
                      </Text>
                    ) : null}

                    <View className="mt-2 flex-row items-center justify-between">
                      <View className="flex-row items-center gap-3">
                        <Pressable
                          onPress={() =>
                            updateLine.mutate({
                              lineId: line.id,
                              quantity: line.quantity - 1,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Decrease quantity of ${variant.product.title}`}
                          hitSlop={8}
                          className="h-8 w-8 items-center justify-center rounded-md border border-border"
                        >
                          <Text className="text-foreground">−</Text>
                        </Pressable>

                        <Text
                          className="min-w-6 text-center text-sm text-foreground"
                          accessibilityLabel={`Quantity ${line.quantity}`}
                        >
                          {line.quantity}
                        </Text>

                        <Pressable
                          onPress={() =>
                            updateLine.mutate({
                              lineId: line.id,
                              quantity: line.quantity + 1,
                            })
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Increase quantity of ${variant.product.title}`}
                          hitSlop={8}
                          className="h-8 w-8 items-center justify-center rounded-md border border-border"
                        >
                          <Text className="text-foreground">+</Text>
                        </Pressable>
                      </View>

                      <Text className="text-sm text-foreground">
                        {formatMoney(line.cost.totalAmount)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {cart && lines.length > 0 ? (
          <View className="border-t border-border px-4 pb-8 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm text-foreground-muted">Subtotal</Text>
              <Text className="text-sm font-medium text-foreground">
                {formatMoney(cart.cost.subtotalAmount)}
              </Text>
            </View>

            <Text className="mb-3 text-xs text-foreground-muted">
              Taxes and shipping calculated at checkout.
            </Text>

            <Pressable
              onPress={() => checkout.present(cart.checkoutUrl)}
              accessibilityRole="button"
              className="rounded-md bg-brand-600 px-4 py-3"
            >
              <Text className="text-center text-sm font-semibold text-surface">
                Checkout
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};
