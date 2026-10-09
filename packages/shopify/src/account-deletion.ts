/**
 * Account deletion (SHO-90): the Worker's responses and the words both
 * storefronts use about them, so web and the app promise exactly the same
 * thing. The deletion itself is apps/api/src/account-deletion.ts.
 *
 * ⚠️ The copy here is a promise to the customer. It says what really happens,
 * including the parts that aren't immediate: Shopify queues the erasure, and
 * holds it for six months after a recent order because order records are kept
 * for tax and accounting. Don't make it sound more instant than it is.
 */

export interface DeletionPreviewSubscription {
  readonly title: string;
  readonly variant: string | null;
  readonly nextDelivery: string | null;
  readonly prepaid: boolean;
}

export interface DeletionPreview {
  readonly ok: true;
  readonly subscriptions: readonly DeletionPreviewSubscription[];
  readonly chargeToday: boolean;
}

export type DeletionFailureReason =
  | "unauthorized"
  | "not-configured"
  | "not-confirmed"
  | "subscriptions"
  | "marketing"
  | "erasure"
  | "rejected"
  | "rate-limited"
  | "network";

export type DeletionResponse =
  | DeletionPreview
  | { readonly ok: true; readonly cancelled: number }
  | { readonly ok: false; readonly reason: DeletionFailureReason };

/** What the Worker's body says, or `network` when there's no usable answer. */
export const readDeletionResponse = async <T extends DeletionResponse>(
  response: Response,
): Promise<T | { readonly ok: false; readonly reason: DeletionFailureReason }> => {
  if (response.status === 429) return { ok: false, reason: "rate-limited" };
  const body = (await response.json().catch(() => null)) as T | null;
  return body && typeof body === "object" && "ok" in body
    ? body
    : { ok: false, reason: "network" };
};

/** The confirmation's request body. The Worker refuses anything else. */
export const DELETION_CONFIRMATION = { confirm: "delete" } as const;

export const DELETION_COPY = {
  heading: "Delete your account",
  intro:
    "This permanently deletes your account. You can't undo it, and you'll be signed out.",
  whatHappens: [
    "Your subscriptions are cancelled straight away, so you won't be charged again.",
    "Your marketing preferences and email history with us are deleted.",
    "Shopify erases your account details and order history. If you've ordered in the last six months, Shopify keeps your order records until six months have passed, because we must keep them for tax and accounting. Otherwise it happens within about 10 days.",
  ],
  noSubscriptions: "You don't have any active subscriptions.",
  subscriptionsHeading: "These subscriptions will be cancelled",
  chargeToday:
    "A subscription payment is due today and may already be processing. If it has been taken, that order will still be sent.",
  prepaid:
    "Paid in advance: the remaining deliveries won't be sent. Contact us about a refund.",
  confirmLabel: "I understand this can't be undone",
  button: "Delete my account",
  deleted: {
    heading: "Your account has been deleted",
    body: "We've cancelled your subscriptions and signed you out. Shopify will finish erasing your details as described above. If you change your mind, you can create a new account at any time, but your order history won't come back.",
  },
} as const;

export const deletionFailureMessage = (reason: DeletionFailureReason): string => {
  switch (reason) {
    case "unauthorized":
      return "Your sign-in has expired. Please sign in again, then try once more.";
    case "not-configured":
      return "Account deletion isn't available here yet. Contact us and we'll delete your account for you.";
    case "subscriptions":
      return "We couldn't cancel your subscriptions, so nothing has been deleted. Please try again in a moment.";
    case "marketing":
    case "erasure":
      return "Your subscriptions are cancelled, but we couldn't finish deleting your account. Please try again: it's safe to repeat.";
    case "rate-limited":
      return "Too many attempts. Please wait a minute and try again.";
    case "not-confirmed":
    case "rejected":
    case "network":
      return "Something went wrong and nothing was deleted. Please try again.";
  }
};
