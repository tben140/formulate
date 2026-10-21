"use server";

import { isCancelReason, type SubscriptionChange } from "@formulate/recharge";
import { redirect } from "next/navigation";

import { customerTokensForAction } from "@/lib/customer-account";
import { changeSubscription } from "@/lib/recharge";

/**
 * The subscription portal's changes (SHO-73, SHO-74), as one Server Action.
 *
 * Every control on the subscription page is a plain `<form>` posting here, so
 * the portal works before JavaScript loads, or without it. The result comes
 * back in the URL (`?done=skip`, `?error=…`), which the page turns into a
 * message, and which survives a reload.
 *
 * Nothing here decides whether a change is allowed: the Worker checks the
 * subscription is the signed-in customer's, and every value's range. This
 * only turns form fields into one of the shapes it accepts.
 */

const field = (form: FormData, name: string): string => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

const wholeNumber = (value: string): number | null =>
  /^\d{1,16}$/.test(value) ? Number(value) : null;

const toChange = (form: FormData): SubscriptionChange | null => {
  switch (field(form, "action")) {
    case "skip":
      return { action: "skip" };
    case "reactivate":
      return { action: "reactivate" };
    case "unskip": {
      const chargeId = wholeNumber(field(form, "chargeId"));
      return chargeId ? { action: "unskip", chargeId } : null;
    }
    case "reschedule": {
      const date = field(form, "date");
      return date ? { action: "reschedule", date } : null;
    }
    case "pause": {
      const months = wholeNumber(field(form, "months"));
      return months ? { action: "pause", months } : null;
    }
    case "quantity": {
      const quantity = wholeNumber(field(form, "quantity"));
      return quantity ? { action: "quantity", quantity } : null;
    }
    case "cancel": {
      // A reason helps, but cancelling must never depend on giving one.
      const given = field(form, "reason");
      const reason = isCancelReason(given) ? given : "other";
      const comment = field(form, "comment");
      return { action: "cancel", reason, ...(comment ? { comment } : {}) };
    }
    default:
      return null;
  }
};

export const changeSubscriptionAction = async (form: FormData): Promise<never> => {
  const id = wholeNumber(field(form, "subscriptionId"));
  if (!id) redirect("/account/subscriptions");
  const page = `/account/subscriptions/${id}`;
  const tokens = await customerTokensForAction(page);

  const change = toChange(form);
  if (!change) redirect(`${page}?error=invalid`);

  const result = await changeSubscription(tokens, id, change);
  if (!result.ok) redirect(`${page}?error=${encodeURIComponent(result.reason)}`);

  const undo = result.skippedChargeId ? `&charge=${result.skippedChargeId}` : "";
  redirect(`${page}?done=${change.action}${undo}`);
};
