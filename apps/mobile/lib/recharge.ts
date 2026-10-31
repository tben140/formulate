import {
  sortSubscriptions,
  type RechargeCharge,
  type RechargeSubscription,
} from "@formulate/recharge";

import { getUsableTokens } from "./customer-account";

/**
 * The subscription portal's data in the app (SHO-71, SHO-72), read through
 * the Worker (apps/api, POST /account/subscriptions), as web does.
 *
 * Recharge's customer-facing Storefront API needs a plan this store doesn't
 * have, so the Worker reads with the Recharge Admin token after checking the
 * customer's Shopify sign-in (option A, 2026-10-08). No Recharge credential
 * of any kind ships in the app.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

export const isRechargeConfigured = Boolean(API_BASE_URL);

const loadError = () =>
  new Error(
    "We couldn't load your subscriptions just now. Please try again in a moment.",
  );

export interface Portal {
  readonly subscriptions: readonly RechargeSubscription[];
  readonly upcoming: readonly RechargeCharge[];
}

/** Subscriptions and queued charges; empty lists when signed out or there are none. */
export const loadPortal = async (): Promise<Portal> => {
  const tokens = await getUsableTokens();
  if (!tokens) return { subscriptions: [], upcoming: [] };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/account/subscriptions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: tokens.accessToken,
      },
      body: "{}",
    });
  } catch (cause) {
    if (__DEV__) console.warn("Subscriptions request failed", cause);
    throw loadError();
  }

  const body = (await response.json().catch(() => null)) as
    | { ok: true; subscriptions: RechargeSubscription[]; upcoming: RechargeCharge[] }
    | { ok: false; reason: string }
    | null;
  if (!body?.ok) {
    if (__DEV__) console.warn(`Subscriptions: ${response.status} ${body?.reason ?? ""}`);
    throw loadError();
  }
  return {
    subscriptions: sortSubscriptions(body.subscriptions),
    upcoming: body.upcoming,
  };
};

interface SubscriptionDetail {
  readonly subscription: RechargeSubscription;
  readonly upcoming: readonly RechargeCharge[];
}

/**
 * One subscription, picked from the customer's own list: another customer's
 * id isn't in it, so it's null. The Worker never takes an id.
 */
export const loadSubscription = async (id: string): Promise<SubscriptionDetail | null> => {
  const portal = await loadPortal();
  const subscription = portal.subscriptions.find((s) => String(s.id) === id);
  return subscription ? { subscription, upcoming: portal.upcoming } : null;
};
