import { beforeEach, expect, jest, test } from "@jest/globals";
import type { RechargeSubscription } from "@formulate/recharge";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import { SubscriptionControls } from "../subscription-controls";

/**
 * The app's portal controls (SHO-73, SHO-74), with the mutation stubbed: these
 * pin what each button asks the Worker for, and what the customer is told.
 */

type Change = { action: string; [key: string]: unknown };
type Callbacks = { onSuccess?: (result: unknown) => void };

const mockMutation: {
  mutate: jest.Mock<(change: Change, callbacks?: Callbacks) => void>;
  isPending: boolean;
  variables: Change | undefined;
} = { mutate: jest.fn(), isPending: false, variables: undefined };

jest.mock("../../lib/use-customer", () => ({
  useChangeSubscription: () => mockMutation,
}));
jest.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

const DAY = 24 * 60 * 60 * 1000;
const isoIn = (days: number) =>
  new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
const NEXT = isoIn(60);

const subscription = (overrides: Partial<RechargeSubscription> = {}) =>
  ({
    id: 891037192,
    status: "active",
    product_title: "Daily Multivitamin",
    variant_title: null,
    price: "13.56",
    quantity: 1,
    order_interval_frequency: "30",
    order_interval_unit: "day",
    // Relative to today, so the "later" dates never fall into the past.
    next_charge_scheduled_at: NEXT,
    presentment_currency: "GBP",
    is_skippable: true,
    is_swappable: true,
    cancelled_at: null,
    created_at: "2026-10-06T16:14:04+00:00",
    ...overrides,
  }) as RechargeSubscription;

/** The last mutate call's change, after answering it with `result`. */
const answerLast = async (result: unknown): Promise<Change> => {
  const [change, callbacks] = mockMutation.mutate.mock.calls.at(-1) ?? [];
  await act(async () => callbacks?.onSuccess?.(result));
  return change as Change;
};

beforeEach(() => {
  mockMutation.mutate.mockReset();
  mockMutation.isPending = false;
  mockMutation.variables = undefined;
});

test("skip, then Undo with the skipped charge", async () => {
  await render(<SubscriptionControls subscription={subscription()} />);
  await fireEvent.press(screen.getByRole("button", { name: "Skip next delivery" }));
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({ action: "skip" });

  await screen.rerender(<SubscriptionControls subscription={subscription()} />);
  await answerLast({ ok: true, skippedChargeId: 555 });
  expect(await screen.findByText("Your next delivery is skipped.")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({
    action: "unskip",
    chargeId: 555,
  });
});

test("pause and move send whole months and real dates", async () => {
  await render(<SubscriptionControls subscription={subscription()} />);
  await fireEvent.press(screen.getByRole("button", { name: "2 months" }));
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({
    action: "pause",
    months: 2,
  });
  await fireEvent.press(screen.getByRole("button", { name: "1 week later" }));
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({
    action: "reschedule",
    date: isoIn(67),
  });
});

test("never offers a date before tomorrow", async () => {
  const soon = isoIn(3);
  await render(
    <SubscriptionControls
      subscription={subscription({ next_charge_scheduled_at: soon })}
    />,
  );
  expect(screen.queryByRole("button", { name: "1 week earlier" })).toBeNull();
  expect(screen.getByRole("button", { name: "1 week later" })).toBeTruthy();
});

test("quantity stops at 6, and Update sends the new number", async () => {
  await render(<SubscriptionControls subscription={subscription({ quantity: 5 })} />);
  const more = screen.getByRole("button", { name: "One more" });
  await fireEvent.press(more);
  await screen.rerender(
    <SubscriptionControls subscription={subscription({ quantity: 5 })} />,
  );
  expect(screen.getByLabelText("6 per delivery")).toBeTruthy();
  expect(screen.getByRole("button", { name: "One more" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Update" }));
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({
    action: "quantity",
    quantity: 6,
  });
});

test("one change at a time: everything is locked while one saves", async () => {
  mockMutation.isPending = true;
  mockMutation.variables = { action: "skip" };
  await render(<SubscriptionControls subscription={subscription()} />);
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "1 month" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "One more" })).toBeDisabled();
});

test("a refusal shows the customer's message, never the reason code", async () => {
  await render(<SubscriptionControls subscription={subscription()} />);
  await fireEvent.press(screen.getByRole("button", { name: "1 month" }));
  await answerLast({ ok: false, reason: "not-allowed" });
  expect(
    await screen.findByText("That change isn't available for this subscription."),
  ).toBeTruthy();
  expect(screen.queryByText(/not-allowed/)).toBeNull();
});

test("a repeated change is announced again", async () => {
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  await render(<SubscriptionControls subscription={subscription()} />);
  await fireEvent.press(screen.getByRole("button", { name: "1 month" }));
  await answerLast({ ok: true });
  await screen.findByText("Paused. Your next delivery has moved back.");
  await fireEvent.press(screen.getByRole("button", { name: "2 months" }));
  await answerLast({ ok: true });
  await screen.findByText("Paused. Your next delivery has moved back.");
  expect(announce.mock.calls.filter(([text]) => text.startsWith("Paused")).length).toBe(
    2,
  );
});

test("a cancelled subscription offers only a restart", async () => {
  await render(
    <SubscriptionControls subscription={subscription({ status: "cancelled" })} />,
  );
  expect(screen.queryByRole("button", { name: "Skip next delivery" })).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Restart this subscription" }),
  );
  expect(mockMutation.mutate.mock.calls.at(-1)?.[0]).toEqual({ action: "reactivate" });
});
