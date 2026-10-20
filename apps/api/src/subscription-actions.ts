import {
  recharge,
  rechargeCustomerId,
  rechargeList,
  type RechargeAdminEnv,
} from "./recharge-admin";
import { bearerToken, verifyCustomer, type CustomerEnv } from "./shopify-customer";

/**
 * Changes to a subscription from the portal (SHO-73, SHO-74), made with the
 * Recharge Admin token on the signed-in customer's behalf.
 *
 *   POST /account/subscriptions/action   { subscriptionId, action, ... }
 *
 * Unlike the read route, this one has to name a subscription. So the id from
 * the request is only ever a **question**: the Worker fetches that
 * subscription and acts only if its Recharge customer is the caller's
 * (verified with Shopify; see shopify-customer.ts). Anything else is answered
 * exactly like a subscription that doesn't exist, so ids can't be probed.
 *
 * Every value is checked against a fixed rule before Recharge sees it, and
 * nothing from the request is forwarded as it arrived.
 *
 * Changing frequency reads the product's Recharge plans, which needs the
 * `read_products` scope on RECHARGE_ADMIN_TOKEN; without it that one action
 * answers "unavailable" and the rest still work.
 *
 * Pause is "move the next delivery out by 1–3 months": Recharge's 2021-11 API
 * has no paused state, and its own portal pauses the same way.
 */

export type ActionsEnv = CustomerEnv & RechargeAdminEnv;

/** As the cart limit (packages/shopify/src/cart-limit.ts): never more than 6. */
const MAX_QUANTITY = 6;
const MAX_PAUSE_MONTHS = 3;
/** Recharge's own cap is longer; a year is plenty for a supplement routine. */
const MAX_RESCHEDULE_DAYS = 365;

/** The reasons the portal offers; free text goes in `comment`. */
export const CANCEL_REASONS = [
  "too-much-product",
  "too-expensive",
  "not-working-for-me",
  "trying-something-else",
  "moving-or-travelling",
  "other",
] as const;
type CancelReason = (typeof CANCEL_REASONS)[number];
const MAX_COMMENT_LENGTH = 300;

export type PortalAction =
  | { readonly action: "skip" }
  | { readonly action: "unskip"; readonly chargeId: number }
  | { readonly action: "reschedule"; readonly date: string }
  | { readonly action: "pause"; readonly months: number }
  | { readonly action: "quantity"; readonly quantity: number }
  | {
      readonly action: "frequency";
      readonly frequency: number;
      readonly unit: "day" | "week" | "month";
    }
  | { readonly action: "cancel"; readonly reason: CancelReason; readonly comment: string }
  | { readonly action: "reactivate" };

export type ActionResult =
  | {
      readonly status: number;
      // `skippedChargeId` lets the page offer "Undo" straight after a skip.
      readonly body: { readonly ok: true; readonly skippedChargeId?: number };
    }
  | {
      readonly status: number;
      readonly body: {
        readonly ok: false;
        readonly reason:
          | "unauthorized"
          | "not-configured"
          | "invalid"
          | "not-found"
          | "not-allowed"
          | "unavailable";
      };
    };

const fail = (
  status: number,
  reason: Extract<ActionResult["body"], { ok: false }>["reason"],
): ActionResult => ({ status, body: { ok: false, reason } });

const isWholeNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** A real calendar date, from tomorrow up to a year ahead (UTC). */
export const isAllowedDate = (value: unknown, now: Date): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) return false;
  const today = new Date(`${isoDate(now)}T00:00:00Z`).getTime();
  const days = (date.getTime() - today) / DAY_MS;
  return days >= 1 && days <= MAX_RESCHEDULE_DAYS;
};

/** Adds whole months, keeping the day where the month allows (31 Jan + 1 → 28/29 Feb). */
export const addMonths = (value: string, months: number): string => {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return isoDate(target);
};

/** The request body as one of the actions above, or null. Nothing else passes. */
export const parseAction = (
  raw: string,
): { subscriptionId: number; action: PortalAction } | null => {
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    body = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const subscriptionId = body.subscriptionId;
  if (!isWholeNumber(subscriptionId, 1, Number.MAX_SAFE_INTEGER)) return null;

  const action = ((): PortalAction | null => {
    switch (body.action) {
      case "skip":
      case "reactivate":
        return { action: body.action };
      case "unskip":
        return isWholeNumber(body.chargeId, 1, Number.MAX_SAFE_INTEGER)
          ? { action: "unskip", chargeId: body.chargeId }
          : null;
      case "reschedule":
        // The range is checked against the clock when the action runs.
        return typeof body.date === "string"
          ? { action: "reschedule", date: body.date }
          : null;
      case "pause":
        return isWholeNumber(body.months, 1, MAX_PAUSE_MONTHS)
          ? { action: "pause", months: body.months }
          : null;
      case "quantity":
        return isWholeNumber(body.quantity, 1, MAX_QUANTITY)
          ? { action: "quantity", quantity: body.quantity }
          : null;
      case "frequency":
        return isWholeNumber(body.frequency, 1, 365) &&
          (body.unit === "day" || body.unit === "week" || body.unit === "month")
          ? { action: "frequency", frequency: body.frequency, unit: body.unit }
          : null;
      case "cancel": {
        const comment = body.comment ?? "";
        return CANCEL_REASONS.includes(body.reason as CancelReason) &&
          typeof comment === "string" &&
          comment.length <= MAX_COMMENT_LENGTH
          ? {
              action: "cancel",
              reason: body.reason as CancelReason,
              comment: comment.trim(),
            }
          : null;
      }
      default:
        return null;
    }
  })();
  return action ? { subscriptionId, action } : null;
};

type AdminSubscription = {
  id?: unknown;
  customer_id?: unknown;
  status?: unknown;
  is_skippable?: unknown;
  next_charge_scheduled_at?: unknown;
  order_interval_frequency?: unknown;
  charge_interval_frequency?: unknown;
  external_product_id?: { ecommerce?: unknown } | null;
};
type AdminCharge = {
  id?: unknown;
  // Charges name their customer as an object, unlike subscriptions
  // (checked against real Admin data, 2026-10-20).
  customer?: { id?: unknown } | null;
  line_items?: { purchase_item_id?: unknown }[];
};

const readOne = async <T>(env: RechargeAdminEnv, path: string, key: string) => {
  const response = await recharge(env, path);
  if (response.status === 404) return "missing" as const;
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const value = body?.[key];
  return value && typeof value === "object" ? (value as T) : null;
};

const write = async (
  env: RechargeAdminEnv,
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
): Promise<boolean> => {
  const response = await recharge(env, path, { method, body: JSON.stringify(body) });
  if (!response.ok) {
    console.error("recharge write failed", {
      path: path.replace(/\d+/g, ":id"),
      status: response.status,
    });
  }
  return response.ok;
};

/**
 * The delivery intervals the product's Recharge plans offer, as "30 day". A
 * frequency outside them would leave the subscription on a schedule its
 * discount wasn't set up for, so it's refused.
 */
const offeredIntervals = async (
  env: RechargeAdminEnv,
  productId: string,
): Promise<Set<string> | null> => {
  const plans = await rechargeList<{
    type?: unknown;
    subscription_preferences?: {
      order_interval_frequency?: unknown;
      interval_unit?: unknown;
    };
  }>(
    env,
    `/plans?external_product_id=${encodeURIComponent(productId)}&limit=50`,
    "plans",
  );
  if (!plans) return null;
  return new Set(
    plans
      .filter((plan) => plan.type === "subscription")
      .map(
        (plan) =>
          `${String(plan.subscription_preferences?.order_interval_frequency)} ${String(plan.subscription_preferences?.interval_unit)}`,
      ),
  );
};

export const actOnSubscription = async (
  env: ActionsEnv,
  request: Request,
  raw: string,
  now: Date = new Date(),
): Promise<ActionResult> => {
  const token = bearerToken(request);
  if (!token) return fail(401, "unauthorized");
  if (!env.RECHARGE_ADMIN_TOKEN) {
    console.error("subscription actions: RECHARGE_ADMIN_TOKEN is not set");
    return fail(503, "not-configured");
  }
  const parsed = parseAction(raw);
  if (!parsed) return fail(400, "invalid");
  const { subscriptionId, action } = parsed;
  if (action.action === "reschedule" && !isAllowedDate(action.date, now)) {
    return fail(400, "invalid");
  }

  const customer = await verifyCustomer(env, token);
  if (!customer) return fail(401, "unauthorized");
  const rechargeId = await rechargeCustomerId(env, customer.id);
  if (rechargeId === null) return fail(502, "unavailable");
  if (rechargeId === "none") return fail(404, "not-found");

  // The ownership check: the same answer for "someone else's" and "no such".
  const subscription = await readOne<AdminSubscription>(
    env,
    `/subscriptions/${subscriptionId}`,
    "subscription",
  );
  if (subscription === null) return fail(502, "unavailable");
  if (subscription === "missing" || subscription.customer_id !== rechargeId) {
    return fail(404, "not-found");
  }

  const isActive = subscription.status === "active";
  const id = subscriptionId;

  switch (action.action) {
    case "skip": {
      if (!isActive || subscription.is_skippable !== true)
        return fail(409, "not-allowed");
      const charges = await rechargeList<AdminCharge>(
        env,
        `/charges?customer_id=${rechargeId}&status=queued&sort_by=scheduled_at-asc&limit=10`,
        "charges",
      );
      if (!charges) return fail(502, "unavailable");
      const charge = charges.find((c) =>
        (c.line_items ?? []).some((line) => line.purchase_item_id === id),
      );
      if (typeof charge?.id !== "number") return fail(409, "not-allowed");
      const ok = await write(env, "POST", `/charges/${charge.id}/skip`, {
        purchase_item_ids: [id],
      });
      return ok
        ? { status: 200, body: { ok: true, skippedChargeId: charge.id } }
        : fail(502, "unavailable");
    }
    case "unskip": {
      // The charge id is also only a question: it must be the caller's.
      const charge = await readOne<AdminCharge>(
        env,
        `/charges/${action.chargeId}`,
        "charge",
      );
      if (charge === null) return fail(502, "unavailable");
      if (charge === "missing" || charge.customer?.id !== rechargeId) {
        return fail(404, "not-found");
      }
      const ok = await write(env, "POST", `/charges/${action.chargeId}/unskip`, {
        purchase_item_ids: [id],
      });
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
    case "reschedule":
    case "pause": {
      if (!isActive) return fail(409, "not-allowed");
      let date: string;
      if (action.action === "reschedule") {
        date = action.date;
      } else {
        const from =
          typeof subscription.next_charge_scheduled_at === "string" &&
          /^\d{4}-\d{2}-\d{2}/.test(subscription.next_charge_scheduled_at)
            ? subscription.next_charge_scheduled_at.slice(0, 10)
            : isoDate(now);
        date = addMonths(from, action.months);
      }
      const ok = await write(env, "POST", `/subscriptions/${id}/set_next_charge_date`, {
        date,
      });
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
    case "quantity": {
      if (!isActive) return fail(409, "not-allowed");
      const ok = await write(env, "PUT", `/subscriptions/${id}`, {
        quantity: action.quantity,
      });
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
    case "frequency": {
      if (!isActive) return fail(409, "not-allowed");
      // Prepaid: charged every N deliveries. Writing one frequency to both
      // intervals would turn it into charge-every-delivery, so it's refused.
      if (
        String(subscription.charge_interval_frequency) !==
        String(subscription.order_interval_frequency)
      ) {
        return fail(409, "not-allowed");
      }
      const productId = subscription.external_product_id?.ecommerce;
      if (typeof productId !== "string") return fail(409, "not-allowed");
      const offered = await offeredIntervals(env, productId);
      if (!offered) return fail(502, "unavailable");
      if (!offered.has(`${action.frequency} ${action.unit}`)) return fail(400, "invalid");
      const ok = await write(env, "PUT", `/subscriptions/${id}`, {
        order_interval_frequency: action.frequency,
        charge_interval_frequency: action.frequency,
        order_interval_unit: action.unit,
      });
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
    case "cancel": {
      if (!isActive) return fail(409, "not-allowed");
      const ok = await write(env, "POST", `/subscriptions/${id}/cancel`, {
        cancellation_reason: action.reason,
        ...(action.comment ? { cancellation_reason_comments: action.comment } : {}),
      });
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
    case "reactivate": {
      if (subscription.status !== "cancelled") return fail(409, "not-allowed");
      const ok = await write(env, "POST", `/subscriptions/${id}/activate`, {});
      return ok ? { status: 200, body: { ok: true } } : fail(502, "unavailable");
    }
  }
};
