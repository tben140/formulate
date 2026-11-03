import { beforeEach, expect, jest, test } from "@jest/globals";
import { render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { FreeShippingBar } from "../free-shipping-bar";

/**
 * How far the cart is from free delivery (£40). The sentence carries the
 * information, the bar is decoration, and VoiceOver hears a change but not
 * the first message, which would talk over the sheet opening.
 */

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
});

test("says how much more is needed below the threshold", async () => {
  await render(<FreeShippingBar subtotal={gbp("27.50")} />);
  expect(screen.getByText("You're £12.50 away from free standard delivery")).toBeTruthy();
});

test("says it's unlocked at exactly the threshold", async () => {
  await render(<FreeShippingBar subtotal={gbp("40.00")} />);
  expect(screen.getByText("You've unlocked free standard delivery")).toBeTruthy();
});

test("shows nothing without a cart", async () => {
  await render(<FreeShippingBar subtotal={null} />);
  expect(screen.toJSON()).toBeNull();
});

test("announces a change, but not the first message", async () => {
  const view = await render(<FreeShippingBar subtotal={gbp("27.50")} />);
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();

  await view.rerender(<FreeShippingBar subtotal={gbp("41.00")} />);
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    "You've unlocked free standard delivery",
  );
});
