import { FIXTURE_PRODUCT_DETAILS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked, waitFor } from "storybook/test";

import { addToCart } from "@/app/actions/cart";

import { AddToCartForm } from "./add-to-cart-form";
import { CartProvider } from "./cart-provider";

/**
 * The product page's buy controls: options, purchase options, price and the
 * button. The Server Action is a spy (.storybook/preview.ts), so nothing
 * reaches Shopify.
 */
const meta = {
  title: "Product/Add to cart form",
  component: AddToCartForm,
  args: { product: FIXTURE_PRODUCT_DETAILS.subscription },
  decorators: [
    (Story) => (
      <CartProvider storeDomain="example.myshopify.com">
        <div className="w-96">
          <Story />
        </div>
      </CartProvider>
    ),
  ],
} satisfies Meta<typeof AddToCartForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Two strengths, one-time or on a subscription. The seed-data plan allocated
 * to the variants isn't offered: its group has no app managing it.
 */
export const WithSubscription: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole("radio", { name: /Delivered every 30 days/ }),
    ).toHaveLength(1);
    await expect(canvas.queryByText(/Seed plan/)).toBeNull();
  },
};

/** Choosing the subscription shows its price. */
export const SubscriptionChosen: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Delivered every 30 days/ }));
    // £17.95 less 10%.
    await expect(canvas.getByText("£16.16", { selector: "p" })).toBeVisible();
  },
};

/** A sold-out flavour stays selectable, and the button says so. */
export const SoldOutOption: Story = {
  args: { product: FIXTURE_PRODUCT_DETAILS.partlySoldOut },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("radio", { name: /Berry/ }));
    const button = canvas.getByRole("button", { name: "Sold out" });
    await expect(button).toHaveAttribute("aria-disabled", "true");
  },
};

/** No options and no plans: a price and a button. */
export const Simple: Story = { args: { product: FIXTURE_PRODUCT_DETAILS.simple } };

export const SoldOut: Story = { args: { product: FIXTURE_PRODUCT_DETAILS.soldOut } };

/** A failed add is announced in the status line under the button. */
export const AddFails: Story = {
  args: { product: FIXTURE_PRODUCT_DETAILS.simple },
  beforeEach: () => {
    mocked(addToCart).mockResolvedValue({
      status: "error",
      message: "We couldn't add that to your cart. Please try again.",
    });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add to cart" }));
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("We couldn't add that"),
    );
  },
};
