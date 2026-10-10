import { gbp } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";

import { FreeShippingBar } from "./free-shipping-bar";

const meta = {
  title: "Cart/Free shipping bar",
  component: FreeShippingBar,
  decorators: [
    (Story) => (
      <View className="w-96 border border-border">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof FreeShippingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partway: Story = { args: { subtotal: gbp("17.95") } };
export const NearlyThere: Story = { args: { subtotal: gbp("35.90") } };
export const Unlocked: Story = { args: { subtotal: gbp("40.00") } };
export const EmptyCart: Story = { args: { subtotal: null } };
