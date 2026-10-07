/**
 * Recharge, read as the signed-in customer (SHO-71).
 *
 * A thin layer over Recharge's storefront-scoped API rather than
 * `@rechargeapps/storefront-client`. Its customer-account login is one HTTP
 * call, its React Native support is unstated, and this repository's shared
 * packages are bare `fetch` so they run unchanged in Node and Hermes. The
 * reasoning is recorded on SHO-55.
 *
 * Two hosts, as the SDK uses them:
 *
 * - **admin.rechargeapps.com** turns a Shopify Customer Account access token
 *   into a Recharge session (`api_token`), authorised by the store's
 *   Recharge *Storefront* API token (`strfnt_…`). The session lasts an hour.
 * - **api.rechargeapps.com** answers reads made with that session, scoped to
 *   that customer only.
 */

export interface RechargeConfig {
  /** e.g. "tben140plus-xcorpito.myshopify.com". Recharge's `shop_url`. */
  readonly storeDomain: string;
  /** A Recharge API token of type **Storefront**. Not the Admin API token. */
  readonly storefrontToken: string;
  /** Overrides, for tests and local mocks only. Production uses Recharge's hosts. */
  readonly adminUrl?: string;
  readonly apiUrl?: string;
}

/** Recharge's API version, the one the official SDK pins. */
export const RECHARGE_API_VERSION = "2021-11";

/** A Recharge customer session. The token is a bearer credential: never log it. */
export interface RechargeSession {
  readonly apiToken: string;
  readonly customerId: string;
  /** Epoch milliseconds. Recharge documents one hour; this keeps a margin. */
  readonly expiresAt: number;
}

/** One hour, less five minutes so a session isn't used in its last moments. */
const SESSION_LIFETIME_MS = 55 * 60 * 1000;

export type RechargeError =
  | { readonly kind: "config"; readonly message: string }
  | { readonly kind: "network"; readonly message: string; readonly cause: unknown }
  /** 401 on a read: the session expired or was revoked. Log in again. */
  | { readonly kind: "session-expired" }
  /** 429: Recharge's leaky bucket (2 requests a second on standard plans). */
  | { readonly kind: "rate-limited" }
  | { readonly kind: "http"; readonly status: number; readonly message: string }
  | { readonly kind: "invalid-response"; readonly message: string };

export type RechargeResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: RechargeError };

export const describeRechargeError = (error: RechargeError): string => {
  switch (error.kind) {
    case "config":
      return `Recharge config error: ${error.message}`;
    case "network":
      return `Recharge network error: ${error.message}`;
    case "session-expired":
      return "Recharge session expired";
    case "rate-limited":
      return "Recharge rate limit reached";
    case "http":
      return `Recharge HTTP ${error.status}: ${error.message}`;
    case "invalid-response":
      return `Recharge invalid response: ${error.message}`;
  }
};

const failure = (error: RechargeError): RechargeResult<never> => ({ ok: false, error });

const missingConfig = (config: RechargeConfig): RechargeError | null =>
  config.storeDomain && config.storefrontToken
    ? null
    : {
        kind: "config",
        message: "Missing the store domain or the Recharge Storefront token.",
      };

const query = (params: Record<string, string>): string =>
  Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

const send = async (
  url: string,
  init: RequestInit,
): Promise<RechargeResult<Record<string, unknown>>> => {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    return failure({
      kind: "network",
      message: cause instanceof Error ? cause.message : "fetch failed",
      cause,
    });
  }

  if (response.status === 401) return failure({ kind: "session-expired" });
  if (response.status === 429) return failure({ kind: "rate-limited" });
  if (!response.ok) {
    return failure({
      kind: "http",
      status: response.status,
      message: await response.text().catch(() => response.statusText),
    });
  }

  try {
    const body: unknown = await response.json();
    return body && typeof body === "object"
      ? { ok: true, data: body as Record<string, unknown> }
      : failure({ kind: "invalid-response", message: "Expected a JSON object." });
  } catch {
    return failure({ kind: "invalid-response", message: "Response wasn't JSON." });
  }
};

/**
 * Exchanges a Shopify Customer Account access token for a Recharge session.
 *
 * Returns `ok` with `null` when Shopify knows the customer but Recharge
 * doesn't: someone who has never subscribed. That's the portal's empty state,
 * not an error.
 */
export const loginWithCustomerAccount = async (
  config: RechargeConfig,
  customerAccountToken: string,
  now: number = Date.now(),
): Promise<RechargeResult<RechargeSession | null>> => {
  const configError = missingConfig(config);
  if (configError) return failure(configError);

  const result = await send(
    `${config.adminUrl ?? "https://admin.rechargeapps.com"}/shopify_customer_account_api_access`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Recharge-Storefront-Access-Token": config.storefrontToken,
      },
      body: JSON.stringify({
        customer_token: customerAccountToken,
        shop_url: config.storeDomain,
      }),
    },
  );
  // A 401 here is the Storefront token or the customer token being refused,
  // not an expired Recharge session; report it as what it is.
  if (!result.ok) {
    return result.error.kind === "session-expired"
      ? failure({ kind: "http", status: 401, message: "Recharge refused the login." })
      : result;
  }

  const { api_token: apiToken, customer_id: customerId } = result.data;
  if (typeof apiToken !== "string" || !apiToken) return { ok: true, data: null };

  return {
    ok: true,
    data: {
      apiToken,
      customerId: String(customerId ?? ""),
      expiresAt: now + SESSION_LIFETIME_MS,
    },
  };
};

export const isSessionExpiring = (session: RechargeSession, now: number = Date.now()) =>
  session.expiresAt <= now;

/** A GET against the customer-scoped API, as the official SDK sends it. */
const read = (
  config: RechargeConfig,
  session: RechargeSession,
  path: string,
  params: Record<string, string> = {},
) =>
  send(
    `${config.apiUrl ?? "https://api.rechargeapps.com"}${path}?${query({
      ...params,
      // The SDK adds this to every customer-scoped call.
      shop_url: config.storeDomain,
    })}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Recharge-Access-Token": session.apiToken,
        "X-Recharge-Version": RECHARGE_API_VERSION,
      },
    },
  );

/**
 * The fields the portal reads. Recharge returns many more; declaring only
 * these keeps the contract honest about what is depended on.
 */
export interface RechargeSubscription {
  readonly id: number;
  readonly status: "active" | "cancelled" | "expired" | string;
  readonly product_title: string;
  readonly variant_title: string | null;
  readonly price: string;
  readonly quantity: number;
  readonly order_interval_frequency: number | string;
  readonly order_interval_unit: "day" | "week" | "month" | string;
  /** A bare date, "2026-11-05", or null when nothing is scheduled. */
  readonly next_charge_scheduled_at: string | null;
  readonly presentment_currency: string | null;
  readonly is_skippable: boolean;
  readonly is_swappable: boolean;
  readonly cancelled_at: string | null;
  readonly created_at: string;
}

export interface RechargeChargeLine {
  readonly purchase_item_id: number;
  readonly title: string;
  readonly variant_title: string | null;
  readonly quantity: number;
  readonly total_price: string;
}

export interface RechargeCharge {
  readonly id: number;
  readonly status: string;
  readonly scheduled_at: string | null;
  readonly subtotal_price: string;
  readonly total_price: string;
  readonly currency: string;
  readonly line_items: readonly RechargeChargeLine[];
  readonly shipping_lines: readonly { readonly title: string; readonly price: string }[];
}

const listOf = <T>(
  result: RechargeResult<Record<string, unknown>>,
  key: string,
): RechargeResult<readonly T[]> => {
  if (!result.ok) return result;
  const value = result.data[key];
  return Array.isArray(value)
    ? { ok: true, data: value as T[] }
    : failure({ kind: "invalid-response", message: `No "${key}" list in the response.` });
};

/** The customer's subscriptions: active first is the caller's job, not Recharge's. */
export const listSubscriptions = async (
  config: RechargeConfig,
  session: RechargeSession,
): Promise<RechargeResult<readonly RechargeSubscription[]>> =>
  listOf<RechargeSubscription>(
    await read(config, session, "/subscriptions", { limit: "50" }),
    "subscriptions",
  );

export const getSubscription = async (
  config: RechargeConfig,
  session: RechargeSession,
  id: string,
): Promise<RechargeResult<RechargeSubscription | null>> => {
  // Digits only: the id goes into a path, and a crafted one mustn't escape it.
  if (!/^\d+$/.test(id)) return { ok: true, data: null };
  const result = await read(config, session, `/subscriptions/${id}`);
  if (!result.ok) {
    // Another customer's id is a 404 for this session: not found, not an error.
    return result.error.kind === "http" && result.error.status === 404
      ? { ok: true, data: null }
      : result;
  }
  const subscription = result.data.subscription;
  return {
    ok: true,
    data:
      subscription && typeof subscription === "object"
        ? (subscription as RechargeSubscription)
        : null,
  };
};

/** Renewals waiting to be charged, soonest first. */
export const listUpcomingCharges = async (
  config: RechargeConfig,
  session: RechargeSession,
): Promise<RechargeResult<readonly RechargeCharge[]>> =>
  listOf<RechargeCharge>(
    await read(config, session, "/charges", {
      status: "queued",
      sort_by: "scheduled_at-asc",
      limit: "10",
    }),
    "charges",
  );
