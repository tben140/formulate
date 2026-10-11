import { FIXTURE_PRODUCT_DETAILS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { fn } from "storybook/test";

import { usePurchase, type Product } from "../lib/use-purchase";

import { StickyAddToCart } from "./sticky-add-to-cart";

/** The bar draws the screen's `usePurchase` state, as AddToCart does. */
const Screen = ({ product }: { readonly product: Product }) => {
  const purchase = usePurchase(product);
  return <StickyAddToCart product={product} purchase={purchase} visible onAdded={fn()} />;
};

/** Pinned to the bottom of the product screen while the in-page button is scrolled away. */
const meta = {
  title: "Product/Sticky add to cart",
  component: Screen,
  args: { product: FIXTURE_PRODUCT_DETAILS.subscription },
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <View className="h-48 w-96">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SoldOut: Story = { args: { product: FIXTURE_PRODUCT_DETAILS.soldOut } };
