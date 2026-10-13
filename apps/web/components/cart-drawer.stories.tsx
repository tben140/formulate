import { FIXTURE_CARTS, FIXTURE_SUGGESTIONS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, type ReactNode } from "react";
import { expect } from "storybook/test";

import { CartDrawer } from "./cart-drawer";
import { CartProvider, useCartUi } from "./cart-provider";

/** Opens the drawer on mount, as Add to cart or the header button would. */
const Opened = ({ children }: { children: ReactNode }) => {
  const { openCart } = useCartUi();
  useEffect(() => openCart(), [openCart]);
  return children;
};

const meta = {
  title: "Cart/Cart drawer",
  component: CartDrawer,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <CartProvider storeDomain="example.myshopify.com">
        <Opened>
          <Story />
        </Opened>
      </CartProvider>
    ),
  ],
} satisfies Meta<typeof CartDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { cart: FIXTURE_CARTS.empty } };

export const OneItem: Story = {
  args: { cart: FIXTURE_CARTS.one, suggestions: FIXTURE_SUGGESTIONS },
};

/** Over the free-delivery threshold, with a subscription line. */
export const SeveralItems: Story = {
  args: { cart: FIXTURE_CARTS.several, suggestions: FIXTURE_SUGGESTIONS },
};

/** The drawer is a labelled modal dialog, and focus moves into it. */
export const AccessibleDialog: Story = {
  args: { cart: FIXTURE_CARTS.one },
  play: async ({ canvas }) => {
    const dialog = await canvas.findByRole("dialog", { name: "Shopping cart" });
    await expect(dialog).toBeVisible();
    await expect(dialog.contains(document.activeElement)).toBe(true);
  },
};
