/**
 * Recharge's Admin API, as this Worker uses it: always scoped by the Shopify
 * customer id that shopify-customer.ts verified, never by an id from a request.
 */

export interface RechargeAdminEnv {
  /** Secret. Recharge Admin API token: customers, subscriptions, orders. */
  readonly RECHARGE_ADMIN_TOKEN?: string;
  /** Test overrides only. */
  readonly RECHARGE_API_URL?: string;
}

const RECHARGE_API = "https://api.rechargeapps.com";
const RECHARGE_VERSION = "2021-11";

export const recharge = (env: RechargeAdminEnv, path: string, init: RequestInit = {}) =>
  fetch(`${env.RECHARGE_API_URL ?? RECHARGE_API}${path}`, {
    ...init,
    headers: {
      "X-Recharge-Access-Token": env.RECHARGE_ADMIN_TOKEN ?? "",
      "X-Recharge-Version": RECHARGE_VERSION,
      "content-type": "application/json",
      accept: "application/json",
    },
  });

/** A list from a Recharge read, or null when Recharge couldn't be read. */
export const rechargeList = async <T>(
  env: RechargeAdminEnv,
  path: string,
  key: string,
): Promise<T[] | null> => {
  const response = await recharge(env, path);
  if (!response.ok) {
    console.error("recharge read failed", {
      path: path.split("?")[0],
      status: response.status,
    });
    return null;
  }
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const list = body?.[key];
  return Array.isArray(list) ? (list as T[]) : null;
};

/**
 * Recharge's id for a Shopify customer: a number, `"none"` when they've never
 * subscribed, or null when Recharge couldn't be read.
 */
export const rechargeCustomerId = async (
  env: RechargeAdminEnv,
  shopifyCustomerId: string,
): Promise<number | "none" | null> => {
  const customers = await rechargeList<{ id: number }>(
    env,
    `/customers?external_customer_id=${shopifyCustomerId}`,
    "customers",
  );
  if (!customers) return null;
  return customers[0]?.id ?? "none";
};
