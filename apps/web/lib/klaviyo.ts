import {
  looksFakeToKlaviyo,
  submitSubscription,
  type EventName,
  type SubscribeResult,
} from "@formulate/analytics";

import { readConsent } from "@/lib/consent";

/**
 * Klaviyo onsite tracking for the web app.
 *
 * ⚠️ Everything here is manual, and that is the point worth understanding.
 *
 * The Liquid theme gets `Viewed Product` and `trackViewedItem` for free: the
 * Klaviyo app embed reads Shopify's `window.meta` object and pushes them with
 * no code at all. `window.meta` exists because Liquid puts it there, so on a
 * headless surface none of it happens — the script has no idea what page it is
 * on or what product is being viewed.
 *
 * So the events are ours to build and ours to fire. See
 * docs/integration-klaviyo.md.
 */

/**
 * The public key. It ships in the client bundle by design — Klaviyo's onsite
 * key is scoped to writing events for one account and nothing else, which is
 * exactly what a `NEXT_PUBLIC_` variable is for. A Klaviyo *private* key must
 * never appear here.
 */
export const KLAVIYO_PUBLIC_KEY = process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY ?? "";

/**
 * The list new subscribers are added to.
 *
 * Public in the same sense as the key above — a list id identifies a
 * destination, not a permission, and the client endpoint requires it. It is
 * separate from the key because it is the one value that changes per store.
 */
export const KLAVIYO_LIST_ID = process.env.NEXT_PUBLIC_KLAVIYO_LIST_ID ?? "";

export const KLAVIYO_SCRIPT_URL = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${KLAVIYO_PUBLIC_KEY}`;

declare global {
  interface Window {
    /**
     * Klaviyo's event queue, and the ONLY thing to push events onto.
     *
     * Starts as a plain array and is replaced by `klaviyo.js` with something
     * that consumes each `push` immediately. Both accept `push`, which is why
     * the queue-style API exists at all.
     */
    _learnq?: { push: (args: unknown[]) => void };
  }
}

/**
 * ⚠️ Events go to `_learnq`, NOT to `window.klaviyo`.
 *
 * This cost a debugging cycle and is worth stating plainly, because
 * `window.klaviyo` looks like the obvious target: after `klaviyo.js` loads it
 * is a real object exposing `push`, `track` and `identify`, and calling
 * `window.klaviyo.push(["track", …])` throws no error.
 *
 * It also does nothing. `klaviyo.js` never reads `window.klaviyo` as a queue —
 * it owns that global. Assigning `window.klaviyo = []` before the script loads
 * is worse still: the array shadows the object the script wants to install, so
 * every event lands in a dead array that is never drained, the script loads
 * perfectly, the `__kla_id` cookie appears, page-view tracking works, and the
 * activity feed stays empty.
 *
 * Proved empirically: a push to `_learnq` is consumed instantly (length stays
 * zero), while pushes to `window.klaviyo` accumulate forever.
 */
const queue = (): { push: (args: unknown[]) => void } => {
  const existing = window._learnq;
  if (existing) return existing;

  // A plain array satisfies the same contract until `klaviyo.js` replaces it.
  const created: unknown[] = [];
  window._learnq = created as unknown as { push: (args: unknown[]) => void };
  return window._learnq;
};

/**
 * Whether events fired before the shopper has chosen may wait in memory.
 *
 * Only for visitors in the **US**, whose state privacy laws work on notice and
 * opt-out; the privacy notice says these events are held and sent if the
 * shopper then accepts on the same page. Everywhere else, the UK and EU
 * especially, events before a choice are **dropped**: PECR expects nothing
 * about the visit to reach Klaviyo unless the shopper agreed first, and sending
 * earlier events after a later "yes" is a grey area (Ben, 2026-10-20).
 *
 * Asked once per page load from `/api/region` (Vercel's IP geolocation; nothing
 * stored). Unknown, failed or not "US" all count as no.
 */
let holdsBeforeChoice: Promise<boolean> | undefined;
const holdsEventsBeforeChoice = (): Promise<boolean> =>
  (holdsBeforeChoice ??= fetch("/api/region", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => (body as { country?: unknown } | null)?.country === "US")
    .catch(() => false));

/**
 * Queues one call for Klaviyo, if the tracking choice allows it.
 *
 * ⚠️ **The consent gate is also `klaviyo.js` never loading.** The script is
 * rendered only once the shopper has accepted (see
 * `components/tracking-consent.tsx`), and without it `_learnq` is a plain array
 * that nothing reads and nothing transmits.
 *
 * - `granted`: straight onto the queue, which `klaviyo.js` sends.
 * - `denied`: dropped.
 * - `unset`: held in memory only where `holdsEventsBeforeChoice` says so (US
 *   visitors), so that accepting on this page sends them, as Klaviyo's embed on
 *   the theme does. Otherwise dropped, even if the shopper accepts later.
 */
// Bumped by `discardQueuedEvents`, so a call still waiting on the region
// answer when the shopper declines is dropped, even if they accept later.
let generation = 0;

const push = (call: unknown[]): void => {
  if (!KLAVIYO_PUBLIC_KEY || typeof window === "undefined") return;
  const consent = readConsent();
  if (consent === "denied") return;
  if (consent === "granted") {
    queue().push(call);
    return;
  }
  const startedIn = generation;
  void holdsEventsBeforeChoice().then((holds) => {
    // The shopper may have declined while the answer was on its way.
    if (holds && startedIn === generation && readConsent() !== "denied") {
      queue().push(call);
    }
  });
};

/**
 * Emits an event, safely.
 *
 * Silently does nothing when the key is unset, so local development and CI
 * without Klaviyo credentials behave normally rather than throwing on every
 * product page.
 */
export const track = (name: EventName, payload: Readonly<object>): void => {
  push(["track", name, payload]);
};

/**
 * Associates the current browser with an email address.
 *
 * Deliberately only called at email capture and checkout. Identifying earlier
 * means guessing, and a confidently wrong profile is worse than an anonymous
 * one — see the identity section of docs/integration-klaviyo.md.
 *
 * Gated like `track`, through `push`. Identifying is what makes Klaviyo transmit, so an
 * ungated `identify` would be an ungated everything.
 */
export const identify = (email: string): void => {
  if (!email) return;
  push(["identify", { $email: email }]);
};

/**
 * Throws away anything queued before the shopper declined.
 *
 * Only meaningful while `_learnq` is still our plain array. Once `klaviyo.js`
 * has replaced it there is nothing queued to discard — it consumes each push
 * immediately — and withdrawing consent reloads the page instead.
 */
export const discardQueuedEvents = (): void => {
  generation += 1;
  if (Array.isArray(window._learnq)) window._learnq.length = 0;
};

/**
 * Subscribes an address, then identifies the browser.
 *
 * ⚠️ **The order matters and the second step is not optional.**
 *
 * `submitSubscription` creates the profile and records consent server-side.
 * That alone changes nothing in the current tab: the copy of `klaviyo.js`
 * running here still considers the visitor anonymous, so every event it has
 * cached — the `Viewed Product` from the page they arrived on, the `Added to
 * Cart` from ten seconds ago — stays cached and unsent.
 *
 * `identify` is what flushes them. It is the difference between a Klaviyo
 * account containing a profile with no history and one containing a shopper's
 * actual session.
 *
 * Identifying only *after* a successful subscribe is deliberate: the shopper
 * has just typed their address and consented, which is the one moment we know
 * who they are without guessing.
 */
export const subscribe = async (email: string): Promise<SubscribeResult> => {
  /*
   * A warning, never a rejection.
   *
   * Klaviyo drops addresses it judges fake and still returns 202, so a demo
   * tested with `@example.com` looks broken with nothing in the console. We
   * cannot reproduce their filter well enough to block on it — a false
   * positive would reject a real shopper — so this only speaks up in
   * development, where the person reading the console is the one who needs it.
   */
  if (process.env.NODE_ENV !== "production" && looksFakeToKlaviyo(email)) {
    console.warn(
      `[klaviyo] "${email}" looks like test data. Klaviyo silently discards ` +
        `addresses containing test/fake/invalid or on example.com and test.com, ` +
        `and still returns 202. Use a plausible address, or nothing will appear ` +
        `in the dashboard. See docs/integration-klaviyo.md.`,
    );
  }

  const result = await submitSubscription({
    publicKey: KLAVIYO_PUBLIC_KEY,
    listId: KLAVIYO_LIST_ID,
    email,
    source: "Double Helix web",
  });

  /*
   * Klaviyo's own words, in the console.
   *
   * The shopper gets "Something went wrong at our end", which is all they can
   * act on. Whoever is configuring this needs the actual cause — and this is
   * the one endpoint in the integration that gives one, so it should not be
   * swallowed. A wrong list id says exactly that:
   *
   *     {"errors":[{"detail":"List not found",
   *       "source":{"pointer":"/data/relationships/list"}}]}
   */
  if (!result.ok && result.reason === "rejected") {
    console.error(`[klaviyo] subscription rejected (${result.status}):`, result.detail);
  }

  if (result.ok) identify(email);
  return result;
};
