import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { hasNativeSdks } from "./expo-go";

/**
 * The app's one tracking choice, for PostHog and Klaviyo together: the
 * counterpart of web's cookie banner, which also covers both (ADR 0008).
 *
 * ⚠️ One choice, not one per vendor. Web asks once for both, and two prompts
 * in the app would let the surfaces disagree about what a "yes" means.
 *
 * This module only holds the choice. Each vendor reacts to it:
 * - `lib/product-analytics.ts` creates PostHog's client only when it is
 *   `granted`, and deletes its anonymous id on `denied`;
 * - `lib/klaviyo.ts` starts the Klaviyo SDK only when it is `granted`, and
 *   resets the SDK's profile on `denied`.
 *
 * Newsletter sign-up is marketing consent, not this. It is recorded by the
 * Worker whatever the choice here (ADR 0007), and must not imply it.
 *
 * Kept in the keychain (expo-secure-store), the app's one persistent store.
 */

/** Public by design: both are inlined into the bundle. */
export const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "";
export const KLAVIYO_PUBLIC_KEY = process.env.EXPO_PUBLIC_KLAVIYO_PUBLIC_KEY ?? "";

/**
 * Whether there is anything to ask about. Klaviyo counts only where its native
 * SDK exists (not Expo Go, not web). Without either, the choice stays `denied`
 * and the banner never shows.
 */
export const TRACKING_AVAILABLE =
  Boolean(POSTHOG_KEY) || (Boolean(KLAVIYO_PUBLIC_KEY) && hasNativeSdks);

export type TrackingConsent = "granted" | "denied" | "unset" | "loading";

/** The name predates Klaviyo joining the choice; kept so a stored answer stands. */
const CONSENT_KEY = "formulate.analytics.consent";

let consent: TrackingConsent = TRACKING_AVAILABLE ? "loading" : "denied";
let askAgain = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Calls `listener` whenever the choice changes or finishes loading. */
export const subscribeToTrackingConsent = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const trackingConsent = (): TrackingConsent => consent;

/** Reads the stored choice once, at startup (app/_layout.tsx). */
export const loadTrackingConsent = async (): Promise<void> => {
  if (!TRACKING_AVAILABLE) return;
  const stored = await SecureStore.getItemAsync(CONSENT_KEY).catch(() => null);
  consent = stored === "granted" || stored === "denied" ? stored : "unset";
  notify();
};

/**
 * Stores the choice, then applies it. Resolves `false` when the keychain write
 * failed; the choice then isn't applied, so the banner can say so and offer
 * another go. One exception: a withdrawal still takes effect now, because
 * tracking must stop on the tap, not on the disk. The stored answer is removed
 * too, where it can be, so the next launch asks again rather than restoring a
 * "granted" that was withdrawn.
 */
export const setTrackingConsent = async (
  next: "granted" | "denied",
): Promise<boolean> => {
  try {
    await SecureStore.setItemAsync(CONSENT_KEY, next);
  } catch {
    if (next === "denied") {
      consent = "denied";
      await SecureStore.deleteItemAsync(CONSENT_KEY).catch(() => undefined);
      notify();
    }
    return false;
  }
  consent = next;
  notify();
  return true;
};

/** Re-renders when the choice changes or finishes loading. */
export const useTrackingConsent = (): TrackingConsent =>
  useSyncExternalStore(subscribeToTrackingConsent, trackingConsent, trackingConsent);

/** "Privacy choices" in the footer: show the banner again. */
export const reopenTrackingChoice = (): void => {
  askAgain = true;
  notify();
};

export const useTrackingChoiceReopened = (): boolean =>
  useSyncExternalStore(
    subscribeToTrackingConsent,
    () => askAgain,
    () => askAgain,
  );

export const closeTrackingChoice = (): void => {
  askAgain = false;
  notify();
};
