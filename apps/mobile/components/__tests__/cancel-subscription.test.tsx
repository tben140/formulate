import { beforeEach, expect, jest, test } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import CancelScreen from "../../app/(tabs)/account/subscriptions/[id]/cancel";

/**
 * Cancelling (SHO-74, SHO-91): offers first, but cancelling is one press and
 * never needs a reason.
 */

type Change = { action: string; [key: string]: unknown };
type Callbacks = { onSuccess?: (result: unknown) => void };

const mockMutation = {
  mutate: jest.fn<(change: Change, callbacks?: Callbacks) => void>(),
  isPending: false,
};
const mockReplace = jest.fn();
const mockSubscription = {
  id: 891037192,
  status: "active",
  product_title: "Daily Multivitamin",
  quantity: 2,
  is_skippable: true,
};

jest.mock("../../lib/use-customer", () => ({
  useChangeSubscription: () => mockMutation,
  useSubscription: () => ({
    isPending: false,
    data: { subscription: mockSubscription, upcoming: [] },
  }),
}));
jest.mock("expo-router", () => ({
  router: { replace: (path: string) => mockReplace(path), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "891037192" }),
}));

const lastChange = () => mockMutation.mutate.mock.calls.at(-1)?.[0];
const answer = async (result: unknown) => {
  const callbacks = mockMutation.mutate.mock.calls.at(-1)?.[1];
  await act(async () => callbacks?.onSuccess?.(result));
};

beforeEach(() => {
  mockMutation.mutate.mockReset();
  mockReplace.mockReset();
});

test("cancelling needs no reason: one press sends 'other'", async () => {
  await render(<CancelScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Cancel subscription" }));
  expect(lastChange()).toEqual({ action: "cancel", reason: "other" });
  await answer({ ok: true });
  expect(mockReplace).toHaveBeenCalledWith(
    "/account/subscriptions/891037192?done=cancel",
  );
});

test("a chosen reason and a comment go with it", async () => {
  await render(<CancelScreen />);
  const reason = screen.getByRole("radio", { name: "It costs too much" });
  await fireEvent.press(reason);
  expect(screen.getByRole("radio", { name: "It costs too much" })).toBeChecked();
  await fireEvent.changeText(
    screen.getByLabelText("Anything else? (optional)"),
    "  Too pricey  ",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Cancel subscription" }));
  expect(lastChange()).toEqual({
    action: "cancel",
    reason: "too-expensive",
    comment: "Too pricey",
  });
});

test("the offers make their change instead, and say so on the subscription", async () => {
  await render(<CancelScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Skip the next delivery" }));
  expect(lastChange()).toEqual({ action: "skip" });
  await answer({ ok: true, skippedChargeId: 555 });
  expect(mockReplace).toHaveBeenCalledWith(
    "/account/subscriptions/891037192?done=skip&charge=555",
  );
  await fireEvent.press(screen.getByRole("button", { name: "Get 1 per delivery" }));
  expect(lastChange()).toEqual({ action: "quantity", quantity: 1 });
});

test("a refusal stays on the screen as an alert", async () => {
  await render(<CancelScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Cancel subscription" }));
  await answer({ ok: false, reason: "unavailable" });
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "We couldn't make that change just now. Please try again in a moment.",
  );
});
