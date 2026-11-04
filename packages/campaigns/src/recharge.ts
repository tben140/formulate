import type { CancelledSubscription } from "./audience";
import type { MissedCharge, SegmentSubscription } from "./segments";
import { PERK_PROPERTY, type PerkOnetime, type PerkSubscription } from "./perks";

/**
 * Recharge's Admin API for the subscriber perk. RECHARGE_API_TOKEN comes
 * from the environment (~/.config/formulate/recharge.env on Ben's machine)
 * and is never printed. Same API version as apps/api.
 */

const API = "https://api.rechargeapps.com";
const VERSION = "2021-11";

const call = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "X-Recharge-Access-Token": token,
      "X-Recharge-Version": VERSION,
      "content-type": "application/json",
      accept: "application/json",
    },
  });
  if (!response.ok)
    throw new Error(`Recharge: HTTP ${response.status} on ${path.split("?")[0]}`);
  return (await response.json()) as Record<string, unknown>;
};

/** Every page of a cursor-paginated list. */
const all = async <T>(token: string, path: string, key: string): Promise<T[]> => {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const separator = path.includes("?") ? "&" : "?";
    const body = await call(
      token,
      cursor
        ? `${path.split("?")[0]}?limit=250&cursor=${encodeURIComponent(cursor)}`
        : `${path}${separator}limit=250`,
    );
    items.push(...((body[key] as T[] | undefined) ?? []));
    cursor = (body.next_cursor as string | null | undefined) ?? null;
  } while (cursor);
  return items;
};

export const activeSubscriptions = async (token: string): Promise<PerkSubscription[]> =>
  (
    await all<{
      id: number;
      address_id: number;
      next_charge_scheduled_at: string | null;
    }>(token, "/subscriptions?status=active", "subscriptions")
  ).map((s) => ({
    id: s.id,
    addressId: s.address_id,
    // A date ("2026-12-04"); some responses add a time.
    nextChargeDate: s.next_charge_scheduled_at?.slice(0, 10) ?? null,
  }));

/** One-time products that already carry a perk mark. */
export const perkOnetimes = async (token: string): Promise<PerkOnetime[]> =>
  (
    await all<{
      address_id: number;
      properties?: { name: string; value: string }[] | null;
    }>(token, "/onetimes", "onetimes")
  )
    .map((o) => ({ addressId: o.address_id, properties: o.properties ?? [] }))
    .filter((o) => o.properties.some((p) => p.name === PERK_PROPERTY));

/** Adds the perk to an address's charge on `date`, free. */
export const addPerk = async (
  token: string,
  perk: {
    addressId: number;
    date: string;
    variantId: string;
    productId: string;
    title: string;
    key: string;
  },
): Promise<number> => {
  const body = await call(token, "/onetimes", {
    method: "POST",
    body: JSON.stringify({
      address_id: perk.addressId,
      next_charge_scheduled_at: perk.date,
      price: "0.00",
      quantity: 1,
      product_title: perk.title,
      external_product_id: { ecommerce: perk.productId.split("/").pop() },
      external_variant_id: { ecommerce: perk.variantId.split("/").pop() },
      properties: [{ name: PERK_PROPERTY, value: perk.key }],
    }),
  });
  return (body.onetime as { id: number }).id;
};

/** Every cancelled subscription, for win-back audiences. */
export const cancelledSubscriptions = async (
  token: string,
): Promise<CancelledSubscription[]> =>
  (
    await all<{ customer_id: number; cancelled_at: string | null }>(
      token,
      "/subscriptions?status=cancelled",
      "subscriptions",
    )
  ).map((s) => ({ customerId: s.customer_id, cancelledAt: s.cancelled_at }));

/** The Recharge customers with an active subscription. */
export const activeCustomerIds = async (token: string): Promise<Set<number>> =>
  new Set(
    (
      await all<{ customer_id: number }>(
        token,
        "/subscriptions?status=active",
        "subscriptions",
      )
    ).map((s) => s.customer_id),
  );

/** Shopify customer GIDs for Recharge customer ids, 250 at a time. */
export const shopifyCustomerIds = async (
  token: string,
  rechargeIds: readonly number[],
): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 0; i < rechargeIds.length; i += 250) {
    const batch = rechargeIds.slice(i, i + 250).join(",");
    const customers = await all<{ external_customer_id?: { ecommerce?: string | null } }>(
      token,
      `/customers?ids=${batch}`,
      "customers",
    );
    for (const customer of customers) {
      const id = customer.external_customer_id?.ecommerce;
      if (id && /^\d+$/.test(id)) ids.push(`gid://shopify/Customer/${id}`);
    }
  }
  return ids;
};

/** Every subscription, in any status, for customer segments. */
export const allSubscriptions = async (token: string): Promise<SegmentSubscription[]> =>
  (
    await all<{
      customer_id: number;
      status: string;
      created_at: string | null;
      cancelled_at: string | null;
    }>(token, "/subscriptions", "subscriptions")
  ).map((s) => ({
    customerId: s.customer_id,
    status: s.status,
    createdAt: s.created_at,
    cancelledAt: s.cancelled_at,
  }));

/** Skipped and failed charges scheduled since `since` ("2026-08-06"). */
export const missedCharges = async (
  token: string,
  since: string,
): Promise<MissedCharge[]> => {
  const charges: MissedCharge[] = [];
  for (const status of ["skipped", "error"]) {
    const page = await all<{ customer?: { id?: number }; scheduled_at: string | null }>(
      token,
      `/charges?status=${status}&scheduled_at_min=${since}`,
      "charges",
    );
    for (const charge of page)
      if (charge.customer?.id)
        charges.push({
          customerId: charge.customer.id,
          scheduledAt: charge.scheduled_at,
        });
  }
  return charges;
};

/** Recharge customer id → Shopify customer GID, for every Recharge customer. */
export const shopifyIdsByRechargeId = async (
  token: string,
): Promise<Map<number, string>> => {
  const map = new Map<number, string>();
  const customers = await all<{
    id: number;
    external_customer_id?: { ecommerce?: string | null };
  }>(token, "/customers", "customers");
  for (const customer of customers) {
    const id = customer.external_customer_id?.ecommerce;
    if (id && /^\d+$/.test(id)) map.set(customer.id, `gid://shopify/Customer/${id}`);
  }
  return map;
};
