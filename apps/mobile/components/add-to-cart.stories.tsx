import { FIXTURE_PRODUCT_DETAILS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { expect, fn } from "storybook/test";

import { usePurchase, type Product } from "../lib/use-purchase";

import { AddToCart } from "./add-to-cart";

/**
 * The selection lives in `usePurchase`, owned by the product screen, so this
 * stands in for the screen: one hook, drawn by AddToCart.
 */
const Screen = ({ product }: { readonly product: Product }) => {
  const purchase = usePurchase(product);
  return <AddToCart product={product} purchase={purchase} onAdded={fn()} />;
};

/** The product screen's buy controls: the counterpart of web's add-to-cart form. */
const meta = {
  title: "Product/Add to cart",
  component: Screen,
  args: { product: FIXTURE_PRODUCT_DETAILS.subscription },
  parameters: {
    // ⚠️ Known finding, fixed by #69 (SHO-92): the options carry
    // accessibilityState.selected, so React Native Web writes no aria-checked
    // and axe flags every radio/checkbox. Remove this once #69 is merged.
    a11y: { config: { rules: [{ id: "aria-required-attr", enabled: false }] } },
  },
  decorators: [
    (Story) => (
      <View className="w-96">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The seed-data plan isn't offered: its group has no app managing it. */
export const WithSubscription: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("radio", { name: /Delivered every 30 days/ }),
    ).toBeVisible();
    await expect(canvas.queryByText(/Seed plan/)).toBeNull();
  },
};

/** A sold-out flavour stays selectable, and the button says so. */
export const SoldOutOption: Story = {
  args: { product: FIXTURE_PRODUCT_DETAILS.partlySoldOut },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Berry, sold out" }));
    await expect(canvas.getByRole("button", { name: "Sold out" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

export const Simple: Story = { args: { product: FIXTURE_PRODUCT_DETAILS.simple } };

export const SoldOut: Story = { args: { product: FIXTURE_PRODUCT_DETAILS.soldOut } };
