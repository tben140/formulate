import {
  sortSubscriptions,
  type RechargeCharge,
  type RechargeSubscription,
} from "@formulate/recharge";
import type { CustomerTokens } from "@formulate/shopify";

/**
 * The subscription portal's server side (SHO-71, SHO-72), read through the
 * Worker (apps/api, POST /account/subscriptions).
 *
 * Recharge's customer-facing Storefront API needs a plan this store doesn't
 * have, so the Worker reads with the Recharge Admin token on the customer's
 * behalf, after checking their Shopify sign-in (option A, 2026-10-08). The
 * Admin token never comes near this app: it lives in Cloudflare only.
 *
 * Server-side only: the Worker sends no CORS headers, so the browser can't
 * call it, and the customer's access token stays in this server's cookie.
 */
const API_URL = process.env.FORMULATE_API_URL ?? "";

export const isRechargeConfigured = Boolean(API_URL);

/** Why the Worker couldn't answer. Logged, and shown only as "try again". */
export interface PortalError {
  readonly status: number | null;
  readonly reason: string;
}

type WorkerAnswer =
  | {
      readonly ok: true;
      readonly subscriptions: readonly RechargeSubscription[];
      readonly upcoming: readonly RechargeCharge[];
    }
  | { readonly ok: false; readonly error: PortalError };

const fetchPortal = async (tokens: CustomerTokens): Promise<WorkerAnswer> => {
  try {
    const response = await fetch(`${API_URL}/account/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: tokens.accessToken,
      },
      body: "{}",
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | {
          ok: true;
          subscriptions: RechargeSubscription[];
          upcoming: RechargeCharge[];
        }
      | { ok: false; reason: string }
      | null;
    if (body?.ok) return body;
    return {
      ok: false,
      error: { status: response.status, reason: body?.reason ?? "invalid-response" },
    };
  } catch (cause) {
    return { ok: false, error: { status: null, reason: String(cause) } };
  }
};

const logError = (error: PortalError) =>
  console.error(`Subscriptions via the Worker failed: ${error.status ?? "network"} ${error.reason}`);

export type PortalData =
  | { readonly kind: "not-connected" }
  /** Signed in, but no subscriptions: never subscribed, or none left. */
  | { readonly kind: "no-subscriptions" }
  | {
      readonly kind: "ready";
      readonly subscriptions: readonly RechargeSubscription[];
      readonly upcoming: readonly RechargeCharge[];
    }
  | { readonly kind: "error"; readonly error: PortalError };

/** Everything the subscriptions page shows, in one Worker call. */
export const loadPortal = async (tokens: CustomerTokens): Promise<PortalData> => {
  if (!isRechargeConfigured) return { kind: "not-connected" };
  const answer = await fetchPortal(tokens);
  if (!answer.ok) {
    logError(answer.error);
    return { kind: "error", error: answer.error };
  }
  return answer.subscriptions.length === 0
    ? { kind: "no-subscriptions" }
    : {
        kind: "ready",
        subscriptions: sortSubscriptions(answer.subscriptions),
        upcoming: answer.upcoming,
      };
};

export type SubscriptionData =
  | { readonly kind: "not-connected" }
  | { readonly kind: "not-found" }
  | {
      readonly kind: "ready";
      readonly subscription: RechargeSubscription;
      readonly upcoming: readonly RechargeCharge[];
    }
  | { readonly kind: "error"; readonly error: PortalError };

/**
 * One subscription, picked from the customer's own list. Another customer's
 * id simply isn't in it, so it's "not found": the Worker never takes an id.
 */
export const loadSubscription = async (
  tokens: CustomerTokens,
  id: string,
): Promise<SubscriptionData> => {
  if (!isRechargeConfigured) return { kind: "not-connected" };
  const answer = await fetchPortal(tokens);
  if (!answer.ok) {
    logError(answer.error);
    return { kind: "error", error: answer.error };
  }
  const subscription = answer.subscriptions.find((s) => String(s.id) === id);
  return subscription
    ? { kind: "ready", subscription, upcoming: answer.upcoming }
    : { kind: "not-found" };
};
