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
  type RechargeResult,
  type RechargeSession,
  type RechargeSubscription,
} from "@formulate/recharge";

import { getUsableTokens } from "./customer-account";

/**
 * The subscription portal's data in the app (SHO-71, SHO-72): the same shared
 * module as web, with the Recharge session in memory rather than a server.
 *
 * In memory, not the keychain: it lasts an hour and can always be recreated
 * from the Customer Account tokens, which are in the keychain. Nothing here
 * outlives the app process.
 */
export const rechargeConfig: RechargeConfig = {
  storeDomain: process.env.EXPO_PUBLIC_SHOPIFY_STORE_DOMAIN ?? "",
  storefrontToken: process.env.EXPO_PUBLIC_RECHARGE_STOREFRONT_TOKEN ?? "",
};

export const isRechargeConfigured = Boolean(
  rechargeConfig.storeDomain && rechargeConfig.storefrontToken,
);

let current: { readonly forToken: string; readonly session: RechargeSession } | null =
  null;

/** Forgets the session, e.g. on sign-out. */
export const clearRechargeSession = () => {
  current = null;
};

/** A Recharge session for the signed-in customer: null when signed out or never subscribed. */
const sessionFor = async ({ fresh = false } = {}): Promise<
  RechargeResult<RechargeSession | null>
> => {
  const tokens = await getUsableTokens();
  if (!tokens) return { ok: true, data: null };

  if (
    current &&
    !fresh &&
    current.forToken === tokens.accessToken &&
    !isSessionExpiring(current.session)
  ) {
    return { ok: true, data: current.session };
  }

  const result = await loginWithCustomerAccount(rechargeConfig, tokens.accessToken);
  current =
    result.ok && result.data
      ? { forToken: tokens.accessToken, session: result.data }
      : null;
  return result;
};

/** Runs reads, logging in again once if Recharge says the session expired. */
const withSession = async <T>(
  run: (session: RechargeSession) => Promise<RechargeResult<T>>,
): Promise<RechargeResult<T> | null> => {
  const first = await sessionFor();
  if (!first.ok) return first;
  if (!first.data) return null;

  const result = await run(first.data);
  if (result.ok || result.error.kind !== "session-expired") return result;

  const second = await sessionFor({ fresh: true });
  if (!second.ok) return second;
  return second.data ? run(second.data) : null;
};

const loadError = () =>
  new Error(
    "We couldn't load your subscriptions just now. Please try again in a moment.",
  );

export interface Portal {
  readonly subscriptions: readonly RechargeSubscription[];
  readonly upcoming: readonly RechargeCharge[];
}

/** Subscriptions and queued charges; empty lists when there are none. */
export const loadPortal = async (): Promise<Portal> => {
  const result = await withSession(async (session) => {
    // In sequence: Recharge allows about two requests a second.
    const subscriptions = await listSubscriptions(rechargeConfig, session);
    if (!subscriptions.ok) return subscriptions;
    const upcoming = await listUpcomingCharges(rechargeConfig, session);
    if (!upcoming.ok) return upcoming;
    return {
      ok: true,
      data: { subscriptions: subscriptions.data, upcoming: upcoming.data },
    };
  });

  if (!result) return { subscriptions: [], upcoming: [] };
  if (!result.ok) {
    if (__DEV__) console.warn(describeRechargeError(result.error));
    throw loadError();
  }
  return {
    subscriptions: sortSubscriptions(result.data.subscriptions),
    upcoming: result.data.upcoming,
  };
};

interface SubscriptionDetail {
  readonly subscription: RechargeSubscription;
  readonly upcoming: readonly RechargeCharge[];
}

export const loadSubscription = async (
  id: string,
): Promise<SubscriptionDetail | null> => {
  const result = await withSession<SubscriptionDetail | null>(async (session) => {
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

  if (!result) return null;
  if (!result.ok) {
    if (__DEV__) console.warn(describeRechargeError(result.error));
    throw loadError();
  }
  return result.data;
};
