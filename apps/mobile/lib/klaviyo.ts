import {
  isPlausibleEmail,
  looksFakeToKlaviyo,
  type SubscribeResult,
} from "@formulate/analytics";
import { Klaviyo } from "klaviyo-react-native-sdk";

/**
 * Klaviyo for the Expo app.
 *
 * ⚠️ **This surface uses the native SDK, not the `/client/` HTTP endpoints the
 * other two use.** That is not a preference — it is forced.
 *
 * Klaviyo fronts `a.klaviyo.com` with Cloudflare bot protection. A React
 * Native `fetch` sends no `Origin`, no `Referer` and a `CFNetwork/Darwin` user
 * agent, so it is challenged and served a 403 HTML interstitial rather than a
 * Klaviyo response. Measured on one machine within the same minute, a browser
 * got `202` on the identical endpoints. See docs/integration-klaviyo.md.
 *
 * The SDK's native networking is not subject to that, which is a large part of
 * why the SDK exists at all.
 *
 * ⚠️ **What the SDK does not do: consent.** There is no subscribe method and
 * no consent field on `Profile` — identity and events only. Klaviyo's in-app
 * forms cannot collect consent yet either, by their own documentation.
 *
 * So consent goes through `apps/api`, a Cloudflare Worker holding a scoped
 * private key. That is what Klaviyo's own documentation prescribes for
 * server-side subscription, and it is the standard mobile pattern: a client in
 * the user's hands cannot hold a credential, so it delegates to a backend.
 *
 * Two functions, and the distinction is load-bearing:
 *
 * - `identify` — who someone is. Events attach to this.
 * - `subscribe` — that they agreed to be emailed. Legal weight.
 *
 * Do not conflate them, and do not let one imply the other.
 */

/**
 * Public by design, inlined by Metro at build time. `EXPO_PUBLIC_` is required
 * rather than stylistic: the bundle *is* the client. A Klaviyo **private** key
 * must never appear in this app — there is no server to hide it behind.
 */
export const KLAVIYO_PUBLIC_KEY = process.env.EXPO_PUBLIC_KLAVIYO_PUBLIC_KEY ?? "";

/**
 * Our own consent proxy — see apps/api.
 *
 * ⚠️ Not a Klaviyo URL. Consent is the one thing neither the SDK nor the
 * client endpoints can do from a native app, so it goes through a worker that
 * holds a private key. Only an address is sent; the list is chosen server-side.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/**
 * Starts the SDK. Called once, from the root layout.
 *
 * Everything else on `Klaviyo` is a no-op until this has run, and it fails
 * quietly rather than throwing — so a missing key produces an app that works
 * and collects nothing, which is the failure mode this integration specialises
 * in. Hence the explicit guard and the warning.
 */
export const initKlaviyo = (): void => {
  if (!KLAVIYO_PUBLIC_KEY) {
    if (__DEV__) {
      console.warn(
        "[klaviyo] EXPO_PUBLIC_KLAVIYO_PUBLIC_KEY is unset — the SDK is inert " +
          "and nothing will be recorded.",
      );
    }
    return;
  }

  Klaviyo.initialize(KLAVIYO_PUBLIC_KEY);
};

/**
 * Reads back the identity the SDK is holding.
 *
 * The SDK persists this itself across launches, which is why this app no
 * longer keeps the address in `expo-secure-store` — a second copy would be one
 * more thing to keep in step, and the SDK's copy is the one its own events
 * attach to. The hand-rolled version is deleted rather than kept "just in
 * case".
 *
 * ⚠️ **It is not readable immediately after `initialize()`.** Measured on a
 * cold start:
 *
 *     t=0ms     ""
 *     t=3000ms  "someone@example-domain.co.uk"
 *
 * The identity is not lost — the native side simply has not restored it yet.
 * So treating an empty result at startup as "anonymous" would be wrong, and
 * wrong in the quiet way: the app would look like it had forgotten the shopper
 * and would keep working. Nothing in this app reads it during boot for that
 * reason. If something needs to, it must tolerate the empty first answer
 * rather than branch on it.
 */
export const readIdentifiedEmail = (): Promise<string | null> =>
  new Promise((resolve) => {
    Klaviyo.getEmail((email: string | null) => resolve(email ?? null));
  });

/**
 * Associates this device with an email address.
 *
 * ⚠️ **This is identification, not subscription.** It creates or updates the
 * Klaviyo profile and gives subsequent events something to attach to. It
 * records **no marketing consent** — see the note at the top of this file.
 *
 * Returns whether the address was usable at all. The SDK's methods are
 * fire-and-forget with no result, so there is nothing further to report: a
 * network failure is retried natively rather than surfaced here.
 */
export const identify = (email: string): boolean => {
  const trimmed = email.trim();
  if (!isPlausibleEmail(trimmed)) return false;

  /*
   * A warning, never a rejection. Klaviyo discards addresses it judges fake —
   * anything on example.com or test.com, or containing test/fake/invalid — and
   * reports nothing. We cannot reproduce their filter well enough to reject a
   * real shopper over it, so this only speaks up in development.
   */
  if (__DEV__ && looksFakeToKlaviyo(trimmed)) {
    console.warn(
      `[klaviyo] "${trimmed}" looks like test data. Klaviyo silently discards ` +
        `addresses containing test/fake/invalid or on example.com and test.com. ` +
        `Use a plausible address, or nothing will appear in the dashboard. ` +
        `See docs/integration-klaviyo.md.`,
    );
  }

  Klaviyo.setEmail(trimmed);
  return true;
};

/**
 * Records marketing consent, then identifies the device.
 *
 * ⚠️ Two different systems, on purpose, and the order matters.
 *
 * Consent goes to our own worker, because Klaviyo offers this app no way to
 * write one: the SDK has no consent API, `/client/subscriptions/` is blocked
 * by Cloudflare from a native client, and in-app forms cannot collect consent
 * yet. Identity goes to the SDK, which is the only thing that can attach
 * future events to the profile.
 *
 * Identity is set only after consent succeeds — the same rule the other two
 * surfaces follow. A device identified against a profile that was never
 * created would attach every later event to nothing.
 */
export const subscribe = async (email: string): Promise<SubscribeResult> => {
  const trimmed = email.trim();

  if (trimmed === "") return { ok: false, reason: "empty" };
  if (!isPlausibleEmail(trimmed)) return { ok: false, reason: "invalid-email" };
  if (!API_BASE_URL) return { ok: false, reason: "not-configured" };

  if (__DEV__ && looksFakeToKlaviyo(trimmed)) {
    console.warn(
      `[klaviyo] "${trimmed}" looks like test data. Klaviyo silently discards ` +
        `addresses containing test/fake/invalid or on example.com and test.com. ` +
        `Use a plausible address, or nothing will appear in the dashboard.`,
    );
  }

  try {
    const response = await fetch(`${API_BASE_URL}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Only the address. The worker builds the Klaviyo payload and chooses
      // the list — see apps/api/src/index.ts for why that is structural.
      body: JSON.stringify({ email: trimmed }),
    });

    if (response.status === 429) return { ok: false, reason: "rate-limited" };

    if (!response.ok) {
      console.error("[klaviyo] consent proxy rejected", response.status);
      return { ok: false, reason: "rejected", status: response.status };
    }
  } catch {
    return { ok: false, reason: "network" };
  }

  // Consent recorded, so the device may now be associated with the profile.
  identify(trimmed);
  return { ok: true };
};
