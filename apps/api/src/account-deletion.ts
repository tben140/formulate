import { KLAVIYO_REVISION } from "@formulate/analytics";

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

export interface DeletionEnv {
  /** Plain vars: they name the store, they grant nothing. */
  readonly SHOPIFY_SHOP_ID: string;
  readonly SHOPIFY_STORE_DOMAIN: string;
  readonly SHOPIFY_API_VERSION: string;
  /**
   * Secrets, all optional so the Worker deploys without them. Until all three
   * are set, these routes answer 503 `not-configured` and delete nothing: the
   * confirmation screen promises each step, so none may be skipped.
   *
   * SHOPIFY_ADMIN_TOKEN: custom app "Formulate Worker", scopes read_customers,
   * read_customer_data_erasure, write_customer_data_erasure.
   * RECHARGE_ADMIN_TOKEN: Recharge Admin API token (customers, subscriptions,
   * charges).
   * KLAVIYO_DELETION_KEY: a Klaviyo private key with data-privacy:write only.
   */
  readonly SHOPIFY_ADMIN_TOKEN?: string;
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

const RECHARGE_API = "https://api.rechargeapps.com";
const RECHARGE_VERSION = "2021-11";
const KLAVIYO_DELETION_URL = "https://a.klaviyo.com/api/data-privacy-deletion-jobs";

/** Charges are scheduled by the store's calendar day, which is London's. */
export const londonToday = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);

interface VerifiedCustomer {
  /** Numeric, as Recharge's `external_customer_id` and Shopify's gid take it. */
  readonly id: string;
  readonly email: string | null;
}

/**
 * Whose token is this? Asked of Shopify's Customer Account API with the token
 * itself, so only a live sign-in for this shop answers.
 */
const verifyCustomer = async (
  env: DeletionEnv,
  accessToken: string,
): Promise<VerifiedCustomer | null> => {
  const response = await fetch(
    `https://shopify.com/${env.SHOPIFY_SHOP_ID}/account/customer/api/${env.SHOPIFY_API_VERSION}/graphql`,
    {
      method: "POST",
      // No "Bearer": the Customer Account API takes the bare token.
      headers: { Authorization: accessToken, "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ customer { id emailAddress { emailAddress } } }",
      }),
    },
  );
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    data?: {
      customer?: { id?: string; emailAddress?: { emailAddress?: string } | null };
    };
  } | null;
  const gid = body?.data?.customer?.id;
  const id = gid?.match(/^gid:\/\/shopify\/Customer\/(\d+)$/)?.[1];
  return id
    ? { id, email: body?.data?.customer?.emailAddress?.emailAddress ?? null }
    : null;
};

interface AdminSubscription {
  readonly id: number;
  readonly product_title: string;
  readonly variant_title: string | null;
  readonly next_charge_scheduled_at: string | null;
  readonly order_interval_frequency: number | string;
  readonly charge_interval_frequency: number | string;
}

const recharge = (env: DeletionEnv, path: string, init: RequestInit = {}) =>
  fetch(`${env.RECHARGE_API_URL ?? RECHARGE_API}${path}`, {
    ...init,
    headers: {
      "X-Recharge-Access-Token": env.RECHARGE_ADMIN_TOKEN ?? "",
      "X-Recharge-Version": RECHARGE_VERSION,
      "content-type": "application/json",
      accept: "application/json",
    },
  });

const rechargeList = async <T>(env: DeletionEnv, path: string, key: string) => {
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

/** The customer's Recharge state, or null when Recharge couldn't be read. */
const rechargeState = async (env: DeletionEnv, customer: VerifiedCustomer) => {
  const customers = await rechargeList<{ id: number }>(
    env,
    `/customers?external_customer_id=${customer.id}`,
    "customers",
  );
  if (!customers) return null;
  const rechargeId = customers[0]?.id;
  // Never subscribed: nothing in Recharge to cancel.
  if (rechargeId === undefined) return { subscriptions: [], charges: [] };

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

/** Reads the token, verifies it, and checks the Admin tokens are present. */
const authorise = async (
  env: DeletionEnv,
  request: Request,
): Promise<VerifiedCustomer | DeletionResult> => {
  const token = request.headers.get("Authorization")?.trim();
  if (!token) return fail(401, "unauthorized");
  if (
    !env.SHOPIFY_ADMIN_TOKEN ||
    !env.RECHARGE_ADMIN_TOKEN ||
    !env.KLAVIYO_DELETION_KEY
  ) {
    console.error("account deletion: an Admin token or KLAVIYO_DELETION_KEY is not set");
    return fail(503, "not-configured");
  }
  const customer = await verifyCustomer(env, token);
  return customer ?? fail(401, "unauthorized");
};

const isResult = (value: VerifiedCustomer | DeletionResult): value is DeletionResult =>
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
        "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_TOKEN ?? "",
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
