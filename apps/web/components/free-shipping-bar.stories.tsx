import { gbp } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { FreeShippingBar } from "./free-shipping-bar";

const meta = {
  title: "Cart/Free shipping bar",
  component: FreeShippingBar,
  decorators: [
    (Story) => (
      <div className="w-96 border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FreeShippingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Partway: Story = { args: { subtotal: gbp("17.95") } };

export const NearlyThere: Story = { args: { subtotal: gbp("35.90") } };

/** Exactly at the threshold counts as unlocked. */
export const Unlocked: Story = { args: { subtotal: gbp("40.00") } };

/** An empty cart: the status region stays mounted but says nothing. */
export const EmptyCart: Story = { args: { subtotal: null } };
