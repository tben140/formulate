import { rechargeCustomerId, rechargeList, type RechargeAdminEnv } from "./recharge-admin";
import { bearerToken, verifyCustomer, type CustomerEnv } from "./shopify-customer";

/**
 * The subscription portal's data (SHO-71, SHO-72), read with the Recharge
 * Admin token. Recharge's customer-facing Storefront API needs a plan this
 * store doesn't have, so the Worker reads on the customer's behalf instead
 * (option A, chosen 2026-10-08).
 *
 *   POST /account/subscriptions   the caller's subscriptions and next charges
 *
 * One route for the list and the detail page: the detail page picks its
 * subscription out of this answer, so no subscription id is ever accepted
 * from a request (see shopify-customer.ts for why ids never are).
 *
 * ⚠️ Admin responses carry far more than the pages show: addresses, payment
 * method ids, notes, internal properties. Only the fields below are copied
 * out, by name. Never return a Recharge object as it arrived.
 */

export type SubscriptionsEnv = CustomerEnv & RechargeAdminEnv;

/** The fields @formulate/recharge's RechargeSubscription declares, and no others. */
const pickSubscription = (s: Record<string, unknown>) => ({
  id: s.id,
  status: s.status,
  product_title: s.product_title,
  variant_title: s.variant_title ?? null,
  price: s.price,
  quantity: s.quantity,
  order_interval_frequency: s.order_interval_frequency,
  order_interval_unit: s.order_interval_unit,
  next_charge_scheduled_at: s.next_charge_scheduled_at ?? null,
  presentment_currency: s.presentment_currency ?? null,
  is_skippable: s.is_skippable,
  is_swappable: s.is_swappable,
  cancelled_at: s.cancelled_at ?? null,
  created_at: s.created_at,
});

const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

/** The fields RechargeCharge declares, and no others. */
const pickCharge = (c: Record<string, unknown>) => ({
  id: c.id,
  status: c.status,
  scheduled_at: c.scheduled_at ?? null,
  subtotal_price: c.subtotal_price,
  total_price: c.total_price,
  currency: c.currency,
  line_items: list(c.line_items).map((line) => ({
    purchase_item_id: line.purchase_item_id,
    title: line.title,
    variant_title: line.variant_title ?? null,
    quantity: line.quantity,
    total_price: line.total_price,
  })),
  shipping_lines: list(c.shipping_lines).map((line) => ({
    title: line.title,
    price: line.price,
  })),
});

export type SubscriptionsResult =
  | {
      readonly status: number;
      readonly body: {
        readonly ok: true;
        readonly subscriptions: readonly ReturnType<typeof pickSubscription>[];
        readonly upcoming: readonly ReturnType<typeof pickCharge>[];
      };
    }
  | {
      readonly status: number;
      readonly body: {
        readonly ok: false;
        readonly reason: "unauthorized" | "not-configured" | "unavailable";
      };
    };

export const listSubscriptions = async (
  env: SubscriptionsEnv,
  request: Request,
): Promise<SubscriptionsResult> => {
  const token = bearerToken(request);
  if (!token) return { status: 401, body: { ok: false, reason: "unauthorized" } };
  if (!env.RECHARGE_ADMIN_TOKEN) {
    console.error("subscriptions: RECHARGE_ADMIN_TOKEN is not set");
    return { status: 503, body: { ok: false, reason: "not-configured" } };
  }

  const customer = await verifyCustomer(env, token);
  if (!customer) return { status: 401, body: { ok: false, reason: "unauthorized" } };

  const rechargeId = await rechargeCustomerId(env, customer.id);
  if (rechargeId === null) {
    return { status: 502, body: { ok: false, reason: "unavailable" } };
  }
  if (rechargeId === "none") {
    return { status: 200, body: { ok: true, subscriptions: [], upcoming: [] } };
  }

  // In sequence: Recharge's leaky bucket allows about two requests a second,
  // and the customer lookup has just used one.
  const subscriptions = await rechargeList<Record<string, unknown>>(
    env,
    `/subscriptions?customer_id=${rechargeId}&limit=50`,
    "subscriptions",
  );
  if (!subscriptions) return { status: 502, body: { ok: false, reason: "unavailable" } };
  const charges = await rechargeList<Record<string, unknown>>(
    env,
    `/charges?customer_id=${rechargeId}&status=queued&sort_by=scheduled_at-asc&limit=10`,
    "charges",
  );
  if (!charges) return { status: 502, body: { ok: false, reason: "unavailable" } };

  return {
    status: 200,
    body: {
      ok: true,
      subscriptions: subscriptions.map(pickSubscription),
      upcoming: charges.map(pickCharge),
    },
  };
};
