import { FIXTURE_PRODUCTS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";

import { ProductRow } from "./product-row";

/** The app's list item for a product: the counterpart of web's product card. */
const meta = {
  title: "Catalogue/Product row",
  component: ProductRow,
  args: { product: FIXTURE_PRODUCTS.magnesium },
  decorators: [
    (Story) => (
      <View className="w-96">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof ProductRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoImage: Story = { args: { product: FIXTURE_PRODUCTS.noImage } };
export const LongTitle: Story = { args: { product: FIXTURE_PRODUCTS.focusSticks } };
