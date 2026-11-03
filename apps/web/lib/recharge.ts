import {
  describeRechargeError,
  getSubscription,
  isSessionExpiring,
  listSubscriptions,
  listUpcomingCharges,
  loginWithCustomerAccount,
  sortSubscriptions,
  type RechargeCharge,
  type RechargeConfig,
  type RechargeError,
  type RechargeResult,
  type RechargeSession,
  type RechargeSubscription,
} from "@formulate/recharge";
import type { CustomerTokens } from "@formulate/shopify";

/**
 * The subscription portal's server side (SHO-71, SHO-72). Every Recharge call
 * happens here; the browser sees rendered pages only.
 *
 * ⚠️ RECHARGE_STOREFRONT_TOKEN stays server-only even though Recharge designs
 * Storefront tokens for client code: nothing in the browser needs it.
 * The ADMIN/API URL overrides exist for local mocks and tests.
 */
export const rechargeConfig: RechargeConfig = {
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN ?? "",
  storefrontToken: process.env.RECHARGE_STOREFRONT_TOKEN ?? "",
  adminUrl: process.env.RECHARGE_ADMIN_URL || undefined,
  apiUrl: process.env.RECHARGE_API_URL || undefined,
};

export const isRechargeConfigured = Boolean(
  rechargeConfig.storeDomain && rechargeConfig.storefrontToken,
);

/**
 * Recharge sessions, kept in this server instance's memory for their hour.
 *
 * Keyed by the customer's access token, which is what the session was issued
 * for. A cold instance (or another one) simply logs in again: one extra call,
 * never a wrong answer. Not a cookie, because a Server Component can't set one,
 * and a second bearer token in the browser would buy nothing.
 */
const sessions = new Map<string, RechargeSession>();

const MAX_SESSIONS = 500;

const sessionFor = async (
  tokens: CustomerTokens,
  { fresh = false } = {},
): Promise<RechargeResult<RechargeSession | null>> => {
  const cached = sessions.get(tokens.accessToken);
  if (cached && !fresh && !isSessionExpiring(cached)) return { ok: true, data: cached };

  const result = await loginWithCustomerAccount(rechargeConfig, tokens.accessToken);
  if (result.ok && result.data) {
    // A crude cap so a long-lived instance can't grow without bound; Map keeps
    // insertion order, so the oldest go first.
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest !== undefined) sessions.delete(oldest);
    }
    sessions.set(tokens.accessToken, result.data);
  }
  return result;
};

/** Runs a read, logging in again once if Recharge says the session has expired. */
const withSession = async <T>(
  tokens: CustomerTokens,
  run: (session: RechargeSession) => Promise<RechargeResult<T>>,
): Promise<RechargeResult<T> | { readonly ok: true; readonly data: "no-customer" }> => {
  const first = await sessionFor(tokens);
  if (!first.ok) return first;
  if (!first.data) return { ok: true, data: "no-customer" };

  const result = await run(first.data);
  if (result.ok || result.error.kind !== "session-expired") return result;

  const second = await sessionFor(tokens, { fresh: true });
  if (!second.ok) return second;
  if (!second.data) return { ok: true, data: "no-customer" };
  return run(second.data);
};

export type PortalData =
  | { readonly kind: "not-connected" }
  /** Signed in, but Recharge has never seen this customer: never subscribed. */
  | { readonly kind: "no-subscriptions" }
  | {
      readonly kind: "ready";
      readonly subscriptions: readonly RechargeSubscription[];
      readonly upcoming: readonly RechargeCharge[];
    }
  | { readonly kind: "error"; readonly error: RechargeError };

/** Everything the subscriptions page shows, in two reads after one login. */
export const loadPortal = async (tokens: CustomerTokens): Promise<PortalData> => {
  if (!isRechargeConfigured) return { kind: "not-connected" };

  const result = await withSession(tokens, async (session) => {
    // In sequence, not in parallel: Recharge's leaky bucket allows about two
    // requests a second, and a login has just used one.
    const subscriptions = await listSubscriptions(rechargeConfig, session);
    if (!subscriptions.ok) return subscriptions;
    const upcoming = await listUpcomingCharges(rechargeConfig, session);
    if (!upcoming.ok) return upcoming;
    return {
      ok: true,
      data: { subscriptions: subscriptions.data, upcoming: upcoming.data },
    };
  });

  if (!result.ok) {
    console.error(describeRechargeError(result.error));
    return { kind: "error", error: result.error };
  }
  if (result.data === "no-customer") return { kind: "no-subscriptions" };
  const { subscriptions, upcoming } = result.data;
  return subscriptions.length === 0
    ? { kind: "no-subscriptions" }
    : { kind: "ready", subscriptions: sortSubscriptions(subscriptions), upcoming };
};

export type SubscriptionData =
  | { readonly kind: "not-connected" }
  | { readonly kind: "not-found" }
  | {
      readonly kind: "ready";
      readonly subscription: RechargeSubscription;
      readonly upcoming: readonly RechargeCharge[];
    }
  | { readonly kind: "error"; readonly error: RechargeError };

export const loadSubscription = async (
  tokens: CustomerTokens,
  id: string,
): Promise<SubscriptionData> => {
  if (!isRechargeConfigured) return { kind: "not-connected" };

  const result = await withSession<{
    readonly subscription: RechargeSubscription;
    readonly upcoming: readonly RechargeCharge[];
  } | null>(tokens, async (session) => {
    const subscription = await getSubscription(rechargeConfig, session, id);
    if (!subscription.ok) return subscription;
    if (!subscription.data) return { ok: true, data: null };
    const upcoming = await listUpcomingCharges(rechargeConfig, session);
    if (!upcoming.ok) return upcoming;
    return {
      ok: true,
      data: { subscription: subscription.data, upcoming: upcoming.data },
    };
  });

  if (!result.ok) {
    console.error(describeRechargeError(result.error));
    return { kind: "error", error: result.error };
  }
  if (result.data === "no-customer" || result.data === null) return { kind: "not-found" };
  return { kind: "ready", ...result.data };
};
