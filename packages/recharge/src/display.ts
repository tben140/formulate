import type { RechargeCharge, RechargeSubscription } from "./client";

/**
 * How the portal words Recharge data, shared so web and the app say the same
 * thing (SHO-72). Money comes back as `{ amount, currencyCode }`, the shape
 * `formatMoney` in @formulate/shopify takes, so formatting stays in one place.
 */

export interface Money {
  readonly amount: string;
  readonly currencyCode: string;
}

const UNIT_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  day: ["day", "days"],
  week: ["week", "weeks"],
  month: ["month", "months"],
};

/** "Every 30 days", "Every week", "Every 2 months". */
export const deliveryFrequency = (
  subscription: Pick<
    RechargeSubscription,
    "order_interval_frequency" | "order_interval_unit"
  >,
): string => {
  const count = Number(subscription.order_interval_frequency);
  const unit = subscription.order_interval_unit.replace(/s$/, "");
  const words = UNIT_WORDS[unit];
  if (!words || !Number.isFinite(count) || count < 1) return "On a schedule";
  return count === 1 ? `Every ${words[0]}` : `Every ${count} ${words[1]}`;
};

/**
 * "5 November 2026" from Recharge's bare "2026-11-05".
 *
 * ⚠️ Read as a calendar date, never a moment in time. Recharge sends dates
 * without a time; as a JavaScript Date that's midnight UTC, and formatting it
 * in a zone behind UTC shows the day before. Klaviyo's emails did exactly
 * that until the date was cut before formatting (SHO-108). Also accepts a
 * full timestamp, using only its date part, for the same reason.
 */
export const formatDeliveryDate = (value: string | null): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return null;
  const [, year, month, day] = match;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
};

export const subscriptionStatusLabel = (status: string): string => {
  switch (status) {
    case "active":
      return "Active";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Finished";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
};

/** The price of one delivery: Recharge's `price` is per unit. */
export const deliveryPrice = (subscription: RechargeSubscription): Money | null => {
  const unit = Number(subscription.price);
  if (!Number.isFinite(unit) || !subscription.presentment_currency) return null;
  return {
    amount: (unit * subscription.quantity).toFixed(2),
    currencyCode: subscription.presentment_currency,
  };
};

export const chargeTotal = (charge: RechargeCharge): Money => ({
  amount: charge.total_price,
  currencyCode: charge.currency,
});

/** Delivery on a charge: free when every shipping line is £0 or there are none. */
export const chargeDelivery = (charge: RechargeCharge): Money => ({
  amount: charge.shipping_lines
    .reduce((sum, line) => sum + (Number(line.price) || 0), 0)
    .toFixed(2),
  currencyCode: charge.currency,
});

/** Active subscriptions first, then by next delivery (soonest first), then newest. */
export const sortSubscriptions = (
  subscriptions: readonly RechargeSubscription[],
): readonly RechargeSubscription[] =>
  [...subscriptions].sort((a, b) => {
    const active = Number(b.status === "active") - Number(a.status === "active");
    if (active !== 0) return active;
    const next = (a.next_charge_scheduled_at ?? "9999").localeCompare(
      b.next_charge_scheduled_at ?? "9999",
    );
    return next !== 0 ? next : b.created_at.localeCompare(a.created_at);
  });

/** The queued charges that include a given subscription. */
export const chargesForSubscription = (
  charges: readonly RechargeCharge[],
  subscriptionId: number,
): readonly RechargeCharge[] =>
  charges.filter((charge) =>
    charge.line_items.some((line) => line.purchase_item_id === subscriptionId),
  );
