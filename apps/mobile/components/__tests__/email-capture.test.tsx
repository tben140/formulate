import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { SubscribeResult } from "@formulate/analytics";

import { EmailCapture } from "../email-capture";

/**
 * The app's email sign-up. These pin the promises it makes: the address goes
 * to Klaviyo and to the cart, "You're on the list" only when consent was
 * recorded, every failure is said in the shopper's words and read out by
 * VoiceOver, and a second tap can't send twice.
 */

const mockSubscribe = jest.fn<(email: string) => Promise<SubscribeResult>>();
const mockIdentify = { mutate: jest.fn<(email: string) => void>() };

jest.mock("../../lib/klaviyo", () => ({
  subscribe: (email: string) => mockSubscribe(email),
}));
jest.mock("../../lib/use-cart", () => ({ useIdentifyBuyer: () => mockIdentify }));

const field = () =>
  screen.getByLabelText("Email address for restock and subscription news");

beforeEach(() => {
  mockSubscribe.mockReset();
  mockIdentify.mutate.mockReset();
  jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
});

test("signing up sends the address to Klaviyo and the cart, then says so", async () => {
  mockSubscribe.mockResolvedValue({ ok: true });
  await render(<EmailCapture />);

  await fireEvent.changeText(field(), "sam@company.com");
  await fireEvent.press(screen.getByRole("button", { name: "Sign up" }));

  expect(mockSubscribe).toHaveBeenCalledWith("sam@company.com");
  expect(mockIdentify.mutate).toHaveBeenCalledWith("sam@company.com");
  expect(screen.getByText("You're on the list. Check your inbox.")).toBeTruthy();
  expect(field().props.value).toBe("");
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
    "You're on the list. Check your inbox.",
  );
});

test("a failure is said in the shopper's words, read out, and nothing reaches the cart", async () => {
  mockSubscribe.mockResolvedValue({ ok: false, reason: "invalid-email" });
  await render(<EmailCapture />);

  await fireEvent.changeText(field(), "sam@example");
  await fireEvent.press(screen.getByRole("button", { name: "Sign up" }));

  const message = "That doesn't look like an email address. Check it and try again.";
  expect(screen.getByText(message)).toBeTruthy();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(message);
  expect(mockIdentify.mutate).not.toHaveBeenCalled();
  // The address stays, so it can be corrected rather than retyped.
  expect(field().props.value).toBe("sam@example");
});

test("editing the address clears a stale message", async () => {
  mockSubscribe.mockResolvedValue({ ok: false, reason: "empty" });
  await render(<EmailCapture />);

  await fireEvent.press(screen.getByRole("button", { name: "Sign up" }));
  expect(screen.getByText("Enter your email address.")).toBeTruthy();

  await fireEvent.changeText(field(), "s");
  expect(screen.queryByText("Enter your email address.")).toBeNull();
});

test("a second tap while signing up doesn't send twice", async () => {
  let finish: (result: SubscribeResult) => void = () => {};
  mockSubscribe.mockReturnValue(
    new Promise<SubscribeResult>((resolve) => {
      finish = resolve;
    }),
  );
  await render(<EmailCapture />);

  await fireEvent.changeText(field(), "sam@company.com");
  // Not awaited: the press only settles once the sign-up does, and it's held
  // open here to tap again while it's in flight.
  const first = fireEvent.press(screen.getByRole("button", { name: "Sign up" }));
  const busy = await screen.findByRole("button", { name: "Signing up…" });
  expect(busy.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  const second = fireEvent.press(busy);

  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true }));
  await Promise.all([first, second]);
  expect(mockSubscribe).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
});
