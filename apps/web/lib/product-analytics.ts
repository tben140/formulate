import {
  SESSION_IDLE_MS,
  anonymousId,
  createProductAnalytics,
  sessionUuid,
  type AnalyticsIdentity,
  type ProductAnalytics,
} from "@formulate/analytics";

import { readConsent } from "./consent";

/**
 * PostHog product analytics on web (SHO-87), behind the same consent as
 * Klaviyo (lib/consent.ts, ADR 0008).
 *
 * ⚠️ The gate is the client's existence. `analytics()` returns null unless the
 * shopper has accepted, so nothing is stored and nothing is sent before then.
 * Events fired while consent is unset are dropped, not queued: on Accept the
 * consent banner sends the current page view instead, which is all a funnel
 * needs.
 *
 * The anonymous id and session live in localStorage, first-party, under one
 * key that `forgetProductAnalytics()` removes when consent is withdrawn.
 */

/** A public project key, safe in the bundle (like the Klaviyo public key). */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

const STORAGE_KEY = "formulate_analytics";

interface Stored {
  readonly distinctId: string;
  readonly sessionId: string;
  readonly lastActive: number;
}

const read = (): Stored | null => {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as Stored | null;
    return value?.distinctId && value.sessionId ? value : null;
  } catch {
    return null;
  }
};

/** The visitor's ids, starting a new session after 30 idle minutes. */
const identity = (): AnalyticsIdentity => {
  const now = Date.now();
  const stored = read();
  const distinctId = stored?.distinctId ?? anonymousId();
  const sessionId =
    stored && now - stored.lastActive < SESSION_IDLE_MS
      ? stored.sessionId
      : sessionUuid(now);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ distinctId, sessionId, lastActive: now } satisfies Stored),
    );
  } catch {
    // Storage blocked: this event still goes, with ids that won't persist.
  }
  return { distinctId, sessionId };
};

let client: ProductAnalytics | null = null;
let referrerSent = false;

/** The client, or null when there's no key or no consent. Browser only. */
export const analytics = (): ProductAnalytics | null => {
  if (!POSTHOG_KEY || typeof window === "undefined" || readConsent() !== "granted")
    return null;
  client ??= createProductAnalytics({
    apiKey: POSTHOG_KEY,
    surface: "web",
    identity,
    context: () => {
      // The referrer only on the first event of the page load: after that it
      // describes this site, not where the visitor came from.
      const referrer = referrerSent ? null : document.referrer || null;
      referrerSent = true;
      return {
        $current_url: window.location.href,
        $host: window.location.host,
        $pathname: window.location.pathname,
        $referrer: referrer,
        $screen_width: window.innerWidth,
      };
    },
  });
  return client;
};

/** On withdrawal of consent: the ids go, and so does the client. */
export const forgetProductAnalytics = (): void => {
  client = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
};
