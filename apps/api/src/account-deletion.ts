import { KLAVIYO_REVISION } from "@formulate/analytics";

import {
  recharge,
  rechargeCustomerId,
  rechargeList,
  type RechargeAdminEnv,
} from "./recharge-admin";
import {
  bearerToken,
  verifyCustomer,
  type CustomerEnv,
  type VerifiedCustomer,
} from "./shopify-customer";
import {
  adminAccessToken,
  hasAdminCredentials,
  type ShopifyAdminEnv,
} from "./shopify-admin";

/**
 * Account deletion (SHO-90), for the web account page and the app.
 *
 * Two routes, both behind the Worker's usual checks (POST, JSON, rate limit):
 *
 *   POST /account/deletion/preview  what deleting would cancel, for the
 *                                   confirmation screen
 *   POST /account/deletion          does it
 *
 * The caller proves who they are with their Shopify Customer Account access
 * token in `Authorization`. The Worker asks Shopify whose token it is, and
 * that answer is the ONLY source of the customer id used below.
 *
 * ⚠️ Never accept a customer id, email or subscription id from the request.
 * This Worker holds Admin tokens for Shopify and Recharge: an id taken from
 * the body would let anyone with any valid sign-in cancel or erase someone
 * else's account. The tests pin this.
 *
 * Deletion runs in a fixed order and stops at the first failure:
 *
 *   1. Cancel active Recharge subscriptions, so nobody is charged for an
 *      account they deleted. Cancelling first also means a failure later
 *      leaves no charges running.
 *   2. Delete the Klaviyo profile (marketing data).
 *   3. Ask Shopify to erase the customer. Shopify queues this: it runs after
 *      about 10 days, or once six months have passed since their last order,
 *      because order records are kept for tax and accounting. Shopify then
 *      tells installed apps (Recharge among them) to redact their copies.
 *
 * Every step is safe to repeat, so "try again" after a failure is correct:
 * already-cancelled subscriptions aren't listed, a second Klaviyo deletion job
 * is harmless, and a second erasure request replaces the first.
 */

export interface DeletionEnv extends CustomerEnv, RechargeAdminEnv, ShopifyAdminEnv {
  /** Plain vars: they name the store, they grant nothing. */
  readonly SHOPIFY_SHOP_ID: string;
  readonly SHOPIFY_STORE_DOMAIN: string;
  readonly SHOPIFY_API_VERSION: string;
  /**
   * Secrets, all optional so the Worker deploys without them. Until all three
   * are set, these routes answer 503 `not-configured` and delete nothing: the
   * confirmation screen promises each step, so none may be skipped.
   *
   * SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET: the Dev Dashboard app
   * "Formulate Worker", scopes read_customers, read_customer_data_erasure,
   * write_customer_data_erasure. Exchanged for a 24-hour Admin token by
   * shopify-admin.ts.
   * RECHARGE_ADMIN_TOKEN: Recharge Admin API token (customers, subscriptions,
   * charges).
   * KLAVIYO_DELETION_KEY: a Klaviyo private key with data-privacy:write only.
   */
  readonly SHOPIFY_CLIENT_ID?: string;
  readonly SHOPIFY_CLIENT_SECRET?: string;
  readonly RECHARGE_ADMIN_TOKEN?: string;
  readonly KLAVIYO_DELETION_KEY?: string;
  /** Test overrides only. */
  readonly RECHARGE_API_URL?: string;
}

/** What the confirmation screen lists. Titles and dates only: no prices, no ids. */
export interface DeletionPreview {
  readonly ok: true;
  readonly subscriptions: readonly {
    readonly title: string;
    readonly variant: string | null;
    /** "2026-11-05", or null. */
    readonly nextDelivery: string | null;
    /** Paid in advance for several deliveries; the rest won't be sent. */
    readonly prepaid: boolean;
  }[];
  /** A charge is due today: it may already be processing, and can't be stopped. */
  readonly chargeToday: boolean;
}

export type DeletionFailure = {
  readonly ok: false;
  readonly reason:
    | "unauthorized"
    | "not-configured"
    | "not-confirmed"
    | "subscriptions"
    | "marketing"
    | "erasure"
    | "rejected";
};

export type DeletionResult =
  | { readonly status: number; readonly body: DeletionPreview }
  | {
      readonly status: number;
      readonly body: { readonly ok: true; readonly cancelled: number };
    }
  | { readonly status: number; readonly body: DeletionFailure };

const fail = (status: number, reason: DeletionFailure["reason"]): DeletionResult => ({
  status,
  body: { ok: false, reason },
});

const KLAVIYO_DELETION_URL = "https://a.klaviyo.com/api/data-privacy-deletion-jobs";

/** Charges are scheduled by the store's calendar day, which is London's. */
export const londonToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);

interface AdminSubscription {
  readonly id: number;
  readonly product_title: string;
  readonly variant_title: string | null;
  readonly next_charge_scheduled_at: string | null;
  readonly order_interval_frequency: number | string;
  readonly charge_interval_frequency: number | string;
}

/** The customer's Recharge state, or null when Recharge couldn't be read. */
const rechargeState = async (env: DeletionEnv, customer: VerifiedCustomer) => {
  const rechargeId = await rechargeCustomerId(env, customer.id);
  if (rechargeId === null) return null;
  // Never subscribed: nothing in Recharge to cancel.
  if (rechargeId === "none") return { subscriptions: [], charges: [] };

  const [subscriptions, charges] = await Promise.all([
    rechargeList<AdminSubscription>(
      env,
      `/subscriptions?customer_id=${rechargeId}&status=active&limit=250`,
      "subscriptions",
    ),
    rechargeList<{ scheduled_at: string | null }>(
      env,
      `/charges?customer_id=${rechargeId}&status=queued&limit=250`,
      "charges",
    ),
  ]);
  return subscriptions && charges ? { subscriptions, charges } : null;
};

const isPrepaid = (subscription: AdminSubscription): boolean =>
  Number(subscription.charge_interval_frequency) >
  Number(subscription.order_interval_frequency);

interface Authorised extends VerifiedCustomer {
  /** A live Shopify Admin token, obtained before anything is changed. */
  readonly adminToken: string;
}

/**
 * Reads the caller's token, checks every credential is present, verifies the
 * customer, and gets a Shopify Admin token, all before anything is changed.
 * A Shopify app that can't issue a token stops deletion here, not halfway
 * through, after subscriptions are already cancelled.
 */
const authorise = async (
  env: DeletionEnv,
  request: Request,
): Promise<Authorised | DeletionResult> => {
  const token = bearerToken(request);
  if (!token) return fail(401, "unauthorized");
  if (
    !hasAdminCredentials(env) ||
    !env.RECHARGE_ADMIN_TOKEN ||
    !env.KLAVIYO_DELETION_KEY
  ) {
    console.error(
      "account deletion: a Shopify, Recharge or Klaviyo credential is not set",
    );
    return fail(503, "not-configured");
  }
  const customer = await verifyCustomer(env, token);
  if (!customer) return fail(401, "unauthorized");
  const adminToken = await adminAccessToken(env);
  if (!adminToken) return fail(503, "not-configured");
  return { ...customer, adminToken };
};

const isResult = (value: Authorised | DeletionResult): value is DeletionResult =>
  "status" in value;

export const previewDeletion = async (
  env: DeletionEnv,
  request: Request,
  now: Date = new Date(),
): Promise<DeletionResult> => {
  const customer = await authorise(env, request);
  if (isResult(customer)) return customer;

  const state = await rechargeState(env, customer);
  if (!state) return fail(502, "subscriptions");

  const today = londonToday(now);
  return {
    status: 200,
    body: {
      ok: true,
      subscriptions: state.subscriptions.map((subscription) => ({
        title: subscription.product_title,
        variant: subscription.variant_title || null,
        nextDelivery: subscription.next_charge_scheduled_at,
        prepaid: isPrepaid(subscription),
      })),
      chargeToday: state.charges.some(
        (charge) => charge.scheduled_at?.slice(0, 10) === today,
      ),
    },
  };
};

export const deleteAccount = async (
  env: DeletionEnv,
  request: Request,
  raw: string,
): Promise<DeletionResult> => {
  // An explicit confirmation in the body, so a request that merely carries a
  // token (a retried preview, a misrouted call) can never delete anything.
  let confirm: unknown;
  try {
    confirm = (JSON.parse(raw) as { confirm?: unknown }).confirm;
  } catch {
    return fail(400, "rejected");
  }
  if (confirm !== "delete") return fail(400, "not-confirmed");

  const customer = await authorise(env, request);
  if (isResult(customer)) return customer;

  // 1. Subscriptions.
  const state = await rechargeState(env, customer);
  if (!state) return fail(502, "subscriptions");
  for (const subscription of state.subscriptions) {
    const response = await recharge(env, `/subscriptions/${subscription.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({
        cancellation_reason: "Account deleted",
        cancellation_reason_comments:
          "Cancelled by the customer's account deletion (SHO-90).",
        // Recharge's own cancellation email: they asked for everything to go.
        send_email: false,
      }),
    });
    if (!response.ok) {
      console.error("recharge cancel failed", { status: response.status });
      return fail(502, "subscriptions");
    }
  }

  // 2. Marketing data.
  // No email on the Shopify account means no Klaviyo profile keyed to it.
  if (customer.email) {
    const response = await fetch(KLAVIYO_DELETION_URL, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${env.KLAVIYO_DELETION_KEY}`,
        "content-type": "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: "data-privacy-deletion-job",
          attributes: {
            profile: { data: { type: "profile", attributes: { email: customer.email } } },
          },
        },
      }),
    });
    if (!response.ok) {
      console.error("klaviyo deletion failed", { status: response.status });
      return fail(502, "marketing");
    }
  }

  // 3. Shopify erasure, last: everything above must have succeeded first.
  const response = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": customer.adminToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        query: `mutation Erase($customerId: ID!) {
          customerRequestDataErasure(customerId: $customerId) {
            customerId
            userErrors { code message }
          }
        }`,
        variables: { customerId: `gid://shopify/Customer/${customer.id}` },
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    data?: { customerRequestDataErasure?: { userErrors?: { code?: string }[] } };
    errors?: unknown;
  } | null;
  const userErrors = body?.data?.customerRequestDataErasure?.userErrors;
  if (!response.ok || body?.errors || !userErrors || userErrors.length > 0) {
    console.error("shopify erasure failed", {
      status: response.status,
      codes: userErrors?.map((error) => error.code),
    });
    return fail(502, "erasure");
  }

  return { status: 200, body: { ok: true, cancelled: state.subscriptions.length } };
};
