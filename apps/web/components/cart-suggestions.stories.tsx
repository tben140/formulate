import { FIXTURE_SUGGESTIONS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CartProvider } from "./cart-provider";
import { CartSuggestions } from "./cart-suggestions";

/** "You might also like", as it sits at the bottom of the cart drawer. */
const meta = {
  title: "Cart/Cart suggestions",
  component: CartSuggestions,
  args: { suggestions: FIXTURE_SUGGESTIONS },
  decorators: [
    (Story) => (
      <CartProvider storeDomain="example.myshopify.com">
        <div className="w-96">
          <Story />
        </div>
      </CartProvider>
    ),
  ],
} satisfies Meta<typeof CartSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One product adds straight away; one has options, so it links to its page. */
export const Default: Story = {};

/** Nothing to suggest: no heading over an empty gap. */
export const None: Story = {
  args: { suggestions: [] },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("You might also like")).toBeNull();
  },
};
