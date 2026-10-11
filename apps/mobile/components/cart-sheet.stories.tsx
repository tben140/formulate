import { FIXTURE_CARTS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, fn, mocked, screen } from "storybook/test";

import { checkout } from "../lib/__mocks__/checkout";
import { useCart } from "../lib/use-cart";

import { CartSheet } from "./cart-sheet";

type FixtureCart = (typeof FIXTURE_CARTS)[keyof typeof FIXTURE_CARTS];

/**
 * The cart the sheet reads. Only the fields it uses: the cast stands in for
 * the rest of TanStack Query's result.
 */
const withCart = (cart: FixtureCart) => () => {
  mocked(useCart).mockReturnValue({
    data: cart,
    isLoading: false,
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof useCart>);
};

/**
 * The cart as a bottom sheet: the app's counterpart of web's drawer. On iOS
 * it's a native page sheet; here, React Native Web's modal. The modal renders
 * outside the story's root, so tests query the whole page.
 *
 * React Native Web gives the modal its dialog role only once the slide-in
 * finishes, and until then it's an aria-modal div with no role, which axe
 * rejects. So every story waits for the dialog: the scan checks the open
 * sheet, not the frames of its animation.
 */
const meta = {
  title: "Cart/Cart sheet",
  component: CartSheet,
  args: { visible: true, onClose: fn() },
  parameters: { layout: "fullscreen" },
  play: async () => {
    await screen.findByRole("dialog");
  },
} satisfies Meta<typeof CartSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { beforeEach: withCart(FIXTURE_CARTS.empty) };

export const OneItem: Story = { beforeEach: withCart(FIXTURE_CARTS.one) };

/** Over the free-delivery threshold, with a subscription line. Checkout opens Shopify's. */
export const SeveralItems: Story = {
  beforeEach: withCart(FIXTURE_CARTS.several),
  play: async ({ userEvent }) => {
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: /Checkout/ }));
    await expect(checkout.present).toHaveBeenCalledWith(
      FIXTURE_CARTS.several.checkoutUrl,
    );
  },
};
