import {
  SESSION_IDLE_MS,
  anonymousId,
  createProductAnalytics,
  sessionUuid,
  type ProductAnalytics,
} from "@formulate/analytics";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
  POSTHOG_KEY,
  subscribeToTrackingConsent,
  trackingConsent,
} from "./tracking-consent";

/**
 * PostHog product analytics in the app (SHO-87), the app's half of
 * apps/web/lib/product-analytics.ts: the same events from the same shared
 * module, behind the app's own consent choice.
 *
 * ⚠️ As on web, the gate is the client's existence. `analytics()` is null until
 * the shopper accepts in the app's banner (components/analytics-consent.tsx),
 * and the anonymous id is only created then. Declining, or withdrawing later,
 * deletes it. The choice itself lives in lib/tracking-consent.ts, shared with
 * Klaviyo.
 *
 * The id is kept in the keychain (expo-secure-store), the app's one persistent
 * store; the session lives in memory and ends after 30 idle minutes or when
 * the app process does.
 */

const ID_KEY = "formulate.analytics.id";

let distinctId: string | null = null;
let session: { id: string; lastActive: number } | null = null;
let client: ProductAnalytics | null = null;

/**
 * Reads the stored anonymous id. Called at startup **before** the choice is
 * loaded (app/_layout.tsx), so no event can be sent, and mint a new id over a
 * returning shopper's, while the keychain read is still in flight: `analytics()`
 * is null until the choice says `granted`, and that comes second. An id only
 * exists if the shopper accepted before, so reading it tracks nothing.
 */
/** Counts withdrawals, so an id read that started before one is discarded. */
let forgotten = 0;

export const loadAnalyticsIdentity = async (): Promise<void> => {
  if (!POSTHOG_KEY) return;
  const generation = forgotten;
  const stored = await SecureStore.getItemAsync(ID_KEY).catch(() => null);
  // A decline during the read deletes the id; the read mustn't bring it back.
  if (generation === forgotten) distinctId ??= stored;
};

/*
 * Follows the app's one tracking choice (lib/tracking-consent.ts): declining,
 * or withdrawing later, deletes the id, the session and the client.
 */
subscribeToTrackingConsent(() => {
  if (trackingConsent() !== "denied") return;
  forgotten += 1;
  distinctId = null;
  session = null;
  client = null;
  void SecureStore.deleteItemAsync(ID_KEY).catch(() => undefined);
});

const identity = () => {
  if (!distinctId) {
    distinctId = anonymousId();
    void SecureStore.setItemAsync(ID_KEY, distinctId).catch(() => undefined);
  }
  const now = Date.now();
  if (!session || now - session.lastActive >= SESSION_IDLE_MS) {
    session = { id: sessionUuid(now), lastActive: now };
  }
  session.lastActive = now;
  return { distinctId, sessionId: session.id };
};

/**
 * The shopper's PostHog id, or null without a key or consent. For tagging a
 * new cart so the custom pixel credits its order to this shopper
 * (packages/analytics, `cartAttributes`).
 */
export const analyticsDistinctId = (): string | null =>
  POSTHOG_KEY && trackingConsent() === "granted" ? identity().distinctId : null;

/** The client, or null without a key or consent. */
export const analytics = (): ProductAnalytics | null => {
  if (!POSTHOG_KEY || trackingConsent() !== "granted") return null;
  client ??= createProductAnalytics({
    apiKey: POSTHOG_KEY,
    surface: "app",
    identity,
    context: () => ({
      $os: Platform.OS,
      $app_version: Constants.expoConfig?.version ?? null,
    }),
  });
  return client;
};
