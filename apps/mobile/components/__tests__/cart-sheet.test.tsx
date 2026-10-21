import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { CartSheet } from "../cart-sheet";

/**
 * The app's cart sheet, with the cart hooks and Checkout Sheet Kit stubbed:
 * these pin the promises about a shopper's cart. Quantity buttons change one
 * line by one; checkout opens Shopify's own checkout; and the cart is cleared
 * only after a real purchase, never when the shopper backs out or payment
 * fails.
 */

type Listener = () => void;

const mockListeners: Record<string, Listener> = {};
const mockCheckout = {
  present: jest.fn<(url: string) => void>(),
  addEventListener: (name: string, listener: Listener) => {
    mockListeners[name] = listener;
    return { remove: () => delete mockListeners[name] };
  },
};
const mockUpdateLine = { mutate: jest.fn<(change: unknown) => void>(), isPending: false };
const mockClearCart = { mutate: jest.fn<() => void>() };
const mockCart: { data: unknown; isPending: boolean } = { data: null, isPending: false };

jest.mock("../../lib/checkout", () => ({ useCheckout: () => mockCheckout }));
jest.mock("../../lib/use-cart", () => ({
  useCart: () => mockCart,
  useUpdateCartLine: () => mockUpdateLine,
  useClearCart: () => mockClearCart,
}));

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

const cart = (quantity = 2) => ({
  id: "cart-1",
  checkoutUrl: "https://shop.example/checkouts/abc",
  totalQuantity: quantity,
  cost: { subtotalAmount: gbp("27.12"), totalAmount: gbp("27.12"), totalTaxAmount: null },
  lines: {
    nodes: [
      {
        id: "line-1",
        quantity,
        cost: { totalAmount: gbp("27.12") },
        merchandise: {
          id: "v-1",
          title: "Standard",
          availableForSale: true,
          image: null,
          price: gbp("13.56"),
          selectedOptions: [{ name: "Strength", value: "Standard" }],
          product: {
            id: "p-1",
            handle: "daily-multivitamin",
            title: "Daily Multivitamin",
          },
        },
        sellingPlanAllocation: null,
      },
    ],
  },
});

const renderSheet = async (onClose = jest.fn()) => {
  await render(<CartSheet visible onClose={onClose} />);
  return onClose;
};

beforeEach(() => {
  for (const key of Object.keys(mockListeners)) delete mockListeners[key];
  mockCheckout.present.mockReset();
  mockUpdateLine.mutate.mockReset();
  mockClearCart.mutate.mockReset();
  mockCart.data = cart();
  mockCart.isPending = false;
});

test("the quantity buttons change that line by one", async () => {
  await renderSheet();
  await fireEvent.press(
    screen.getByRole("button", { name: "Increase quantity of Daily Multivitamin" }),
  );
  expect(mockUpdateLine.mutate.mock.calls.at(-1)?.[0]).toMatchObject({
    lineId: "line-1",
    quantity: 3,
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Decrease quantity of Daily Multivitamin" }),
  );
  expect(mockUpdateLine.mutate.mock.calls.at(-1)?.[0]).toMatchObject({
    lineId: "line-1",
    quantity: 1,
  });
});

test("checkout opens Shopify's checkout for this cart", async () => {
  await renderSheet();
  await fireEvent.press(screen.getByRole("button", { name: /Checkout/ }));
  expect(mockCheckout.present).toHaveBeenCalledWith("https://shop.example/checkouts/abc");
});

test("after a purchase the cart is cleared, and closing checkout closes the sheet", async () => {
  const onClose = await renderSheet();
  await act(async () => mockListeners.completed?.());
  expect(mockClearCart.mutate).toHaveBeenCalledTimes(1);
  await act(async () => mockListeners.close?.());
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("backing out of checkout leaves the cart and the sheet exactly as they were", async () => {
  const onClose = await renderSheet();
  await act(async () => mockListeners.close?.());
  expect(mockClearCart.mutate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test("a failed checkout keeps the cart, and a later close doesn't dismiss it", async () => {
  const onClose = await renderSheet();
  await act(async () => mockListeners.error?.());
  await act(async () => mockListeners.close?.());
  expect(mockClearCart.mutate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test("an empty cart says so, with nothing to check out", async () => {
  mockCart.data = { ...cart(), totalQuantity: 0, lines: { nodes: [] } };
  await renderSheet();
  expect(screen.getByText("Your cart is empty.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Checkout/ })).toBeNull();
});
