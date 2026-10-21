/**
 * Changes a customer can make to a subscription from the portal (SHO-73,
 * SHO-74), shared by web and the app so both ask the Worker the same way and
 * say the same things.
 *
 * The Worker (apps/api src/subscription-actions.ts) is the authority on what
 * is allowed; it repeats these limits rather than trusting them.
 */

/** As the cart limit and the Worker: never more than 6 of one product. */
export const MAX_SUBSCRIPTION_QUANTITY = 6;

/** "Pause" moves the next delivery back by whole months, up to this many. */
export const MAX_PAUSE_MONTHS = 3;

/** The reasons offered when cancelling, as the Worker accepts them. */
export const CANCEL_REASONS = [
  { value: "too-much-product", label: "I have too much" },
  { value: "too-expensive", label: "It costs too much" },
  { value: "not-working-for-me", label: "It isn't right for me" },
  { value: "trying-something-else", label: "I'm trying something else" },
  { value: "moving-or-travelling", label: "I'm moving or travelling" },
  { value: "other", label: "Something else" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];

export type SubscriptionChange =
  | { readonly action: "skip" }
  | { readonly action: "unskip"; readonly chargeId: number }
  | { readonly action: "reschedule"; readonly date: string }
  | { readonly action: "pause"; readonly months: number }
  | { readonly action: "quantity"; readonly quantity: number }
  | {
      readonly action: "cancel";
      readonly reason: CancelReason;
      readonly comment?: string;
    }
  | { readonly action: "reactivate" };

export type SubscriptionChangeResult =
  | { readonly ok: true; readonly skippedChargeId?: number }
  | { readonly ok: false; readonly reason: string };

export const isCancelReason = (value: string): value is CancelReason =>
  CANCEL_REASONS.some((reason) => reason.value === value);

/** What to tell the customer after a change worked. */
export const changeDoneMessage = (action: string): string | null => {
  switch (action) {
    case "skip":
      return "Your next delivery is skipped.";
    case "unskip":
      return "Your next delivery is back on.";
    case "reschedule":
      return "Your next delivery date has changed.";
    case "pause":
      return "Paused. Your next delivery has moved back.";
    case "quantity":
      return "Quantity updated.";
    case "cancel":
      return "Your subscription is cancelled. You can restart it here any time.";
    case "reactivate":
      return "Your subscription is active again.";
    default:
      return null;
  }
};

/** What to tell the customer after the Worker said no, by its reason. */
export const changeErrorMessage = (reason: string): string => {
  switch (reason) {
    case "not-allowed":
      return "That change isn't available for this subscription.";
    case "invalid":
      return "That didn't look right. Check the date or amount and try again.";
    case "not-found":
      return "We couldn't find that subscription.";
    default:
      return "We couldn't make that change just now. Please try again in a moment.";
  }
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** A YYYY-MM-DD date some days from `from` (UTC), for date limits and shortcuts. */
export const isoDateFrom = (from: Date | string, days: number): string => {
  const start =
    typeof from === "string" ? new Date(`${from.slice(0, 10)}T00:00:00Z`) : from;
  return new Date(start.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};
