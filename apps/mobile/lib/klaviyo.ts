import {
  anonymousId,
  isPlausibleEmail,
  looksFakeToKlaviyo,
  type EventName,
  type SubscribeResult,
} from "@formulate/analytics";

import { hasNativeSdks } from "./expo-go";
import {
  KLAVIYO_PUBLIC_KEY,
  subscribeToTrackingConsent,
  trackingConsent,
} from "./tracking-consent";

type KlaviyoSdk = typeof import("klaviyo-react-native-sdk");

/**
 * The Klaviyo SDK, or `null` in Expo Go and on web (`hasNativeSdks`).
 *
 * ⚠️ Required lazily, never imported. The SDK reads its native module's
 * constants while the module loads, and in Expo Go that module does not exist,
 * so a static import throws before the first screen renders. Every function
 * below checks for `null` before touching the SDK.
 */
const Klaviyo: KlaviyoSdk["Klaviyo"] | null = hasNativeSdks
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("klaviyo-react-native-sdk") as KlaviyoSdk).Klaviyo
  : null;

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
 * Public by design, inlined by Metro at build time; defined with the tracking
 * choice in lib/tracking-consent.ts. `EXPO_PUBLIC_` is required rather than
 * stylistic: the bundle *is* the client. A Klaviyo **private** key must never
 * appear in this app — there is no server to hide it behind.
 */
export { KLAVIYO_PUBLIC_KEY };

/**
 * Our own consent proxy — see apps/api.
 *
 * ⚠️ Not a Klaviyo URL. Consent is the one thing neither the SDK nor the
 * client endpoints can do from a native app, so it goes through a worker that
 * holds a private key. Only an address is sent; the list is chosen server-side.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/** Whether `Klaviyo.initialize` has run in this process. */
let started = false;

/**
 * Starts the SDK once the shopper accepts tracking, and resets it if they
 * withdraw. Called once, from the root layout.
 *
 * ⚠️ **Behind the tracking choice, not at app start** (ADR 0008, SHO-109).
 * Initialising stores an anonymous profile on the device, and what the SDK does
 * on its own after that has not been audited; PECR's storage-and-access rule
 * covers app storage as well as cookies. So nothing Klaviyo runs until a yes,
 * the same guarantee web gets from not loading `klaviyo.js`.
 *
 * Withdrawing calls `resetProfile`, which clears the identity and anonymous id
 * the SDK stored. The SDK cannot be stopped within the process, so every call
 * below also checks the choice; on the next launch it is never started.
 *
 * Everything else on `Klaviyo` is a no-op until `initialize` has run, and it
 * fails quietly rather than throwing, hence the explicit guards and warnings.
 */
export const initKlaviyo = (): void => {
  /*
   * `null` in Expo Go and on web, which have no Klaviyo native module (see above).
   */
  if (!Klaviyo) {
    if (__DEV__) console.warn("[klaviyo] Expo Go or web: the native SDK is not available, so tracking is off.");
    return;
  }

  if (!KLAVIYO_PUBLIC_KEY) {
    if (__DEV__) {
      console.warn(
        "[klaviyo] EXPO_PUBLIC_KLAVIYO_PUBLIC_KEY is unset — the SDK is inert " +
          "and nothing will be recorded.",
      );
    }
    return;
  }

  const sdk = Klaviyo;
  const sync = () => {
    const consent = trackingConsent();
    if (consent === "granted" && !started) {
      sdk.initialize(KLAVIYO_PUBLIC_KEY);
      started = true;
    } else if (consent === "denied" && started) {
      sdk.resetProfile();
    }
  };
  subscribeToTrackingConsent(sync);
  sync();
};

/** The SDK, only while it is started and the shopper still says yes. */
const allowed = (): NonNullable<typeof Klaviyo> | null =>
  Klaviyo && started && trackingConsent() === "granted" ? Klaviyo : null;

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
    // ⚠️ Not started means no answer at all: the SDK never calls back, and a
    // cart creation awaiting this would hang. So resolve rather than ask.
    const sdk = allowed();
    if (!sdk) {
      resolve(null);
      return;
    }
    sdk.getEmail((email: string | null) => resolve(email ?? null));
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
 *
 * Skipped without tracking consent, as web's `identify` is: identifying is
 * what attaches browsing to a person. A subscriber who declined tracking still
 * gets the emails, through the Worker, and no browse or cart flows.
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

  allowed()?.setEmail(trimmed);
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

/**
 * Sends one of the three commerce events, with the payload the theme and web
 * send (`packages/analytics`'s `viewedProduct`, `addedToCart`,
 * `startedCheckout`), so a Klaviyo segment or flow counts app shoppers too.
 *
 * Names are the shared strings, not the SDK's `EventName` enum. The enum's
 * native values are the same strings ("Viewed Product" and so on), and a
 * metric is matched by name, so one source keeps all three surfaces on one
 * metric.
 *
 * Nothing is sent without tracking consent. Unlike web, nothing is queued
 * while the shopper hasn't chosen yet: the app has no script to drain a queue.
 */
export const trackEvent = (name: EventName, payload: object): void => {
  const sdk = allowed();
  if (!sdk) return;

  // Plain JSON for the bridge: drops `undefined`, keeps `null` inside arrays.
  const properties = JSON.parse(JSON.stringify(payload)) as Record<string, object>;
  const value = (payload as { $value?: unknown }).$value;

  sdk.createEvent({
    name,
    properties,
    ...(typeof value === "number" ? { value } : {}),
    /*
     * ⚠️ Without one, the SDK de-duplicates on the time to the second: two adds
     * within a second would record one. Each call here is a real event.
     */
    uniqueId: anonymousId(),
  });
};
