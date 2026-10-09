import {
  SESSION_IDLE_MS,
  anonymousId,
  createProductAnalytics,
  sessionUuid,
  type ProductAnalytics,
} from "@formulate/analytics";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

/**
 * PostHog product analytics in the app (SHO-87), the app's half of
 * apps/web/lib/product-analytics.ts: the same events from the same shared
 * module, behind the app's own consent choice.
 *
 * ⚠️ As on web, the gate is the client's existence. `analytics()` is null until
 * the shopper accepts in the app's banner (components/analytics-consent.tsx),
 * and the anonymous id is only created then. Declining, or withdrawing later,
 * deletes it.
 *
 * The choice and the id are kept in the keychain (expo-secure-store), the app's
 * one persistent store; the session lives in memory and ends after 30 idle
 * minutes or when the app process does.
 */

export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";

export type AnalyticsConsent = "granted" | "denied" | "unset" | "loading";

const CONSENT_KEY = "formulate.analytics.consent";
const ID_KEY = "formulate.analytics.id";

let consent: AnalyticsConsent = POSTHOG_KEY ? "loading" : "denied";
let distinctId: string | null = null;
let session: { id: string; lastActive: number } | null = null;
let client: ProductAnalytics | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Reads the stored choice once, at startup (app/_layout.tsx). */
export const loadAnalyticsConsent = async (): Promise<void> => {
  if (!POSTHOG_KEY) return;
  const stored = await SecureStore.getItemAsync(CONSENT_KEY).catch(() => null);
  consent = stored === "granted" || stored === "denied" ? stored : "unset";
  if (consent === "granted") {
    distinctId = await SecureStore.getItemAsync(ID_KEY).catch(() => null);
  }
  notify();
};

export const setAnalyticsConsent = async (next: "granted" | "denied"): Promise<void> => {
  consent = next;
  await SecureStore.setItemAsync(CONSENT_KEY, next).catch(() => undefined);
  if (next === "denied") {
    distinctId = null;
    session = null;
    client = null;
    await SecureStore.deleteItemAsync(ID_KEY).catch(() => undefined);
  }
  notify();
};

/** Re-renders when the choice changes or finishes loading. */
export const useAnalyticsConsent = (): AnalyticsConsent =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => consent,
    () => consent,
  );

let askAgain = false;
/** "Privacy choices" in the footer: show the banner again. */
export const reopenAnalyticsChoice = (): void => {
  askAgain = true;
  notify();
};
export const useAnalyticsChoiceReopened = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => askAgain,
    () => askAgain,
  );
export const closeAnalyticsChoice = (): void => {
  askAgain = false;
  notify();
};

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

/** The client, or null without a key or consent. */
export const analytics = (): ProductAnalytics | null => {
  if (!POSTHOG_KEY || consent !== "granted") return null;
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
