import type { EventName } from "@formulate/analytics";

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

export const KLAVIYO_SCRIPT_URL = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${KLAVIYO_PUBLIC_KEY}`;

declare global {
  interface Window {
    /**
     * Klaviyo's onsite global.
     *
     * Genuinely two different things over a page's life: a plain array acting
     * as a queue, then the real object once `klaviyo.js` has loaded and
     * drained it. Both accept `push`, which is the entire reason the
     * queue-style API exists.
     */
    klaviyo?: { push: (args: unknown[]) => void } | unknown[];
  }
}

/**
 * The queue Klaviyo's script drains on load.
 *
 * ⚠️ This stub is load-bearing and easy to leave out. On the Liquid theme the
 * app embed emits an inline snippet that creates it; a bare `<Script>` tag
 * creates nothing, so `window.klaviyo` is simply `undefined` until the script
 * arrives. Without this, every event fired before then — including
 * `Viewed Product`, which fires on mount — is silently dropped, with the
 * script loading perfectly and the feed staying empty.
 */
const queue = (): { push: (args: unknown[]) => void } | unknown[] => {
  window.klaviyo ??= [];
  return window.klaviyo;
};

/**
 * Emits an event, safely.
 *
 * Silently does nothing when the key is unset, so local development and CI
 * without Klaviyo credentials behave normally rather than throwing on every
 * product page.
 */
export const track = (name: EventName, payload: Readonly<object>): void => {
  if (!KLAVIYO_PUBLIC_KEY || typeof window === "undefined") return;
  queue().push(["track", name, payload]);
};

/**
 * Associates the current browser with an email address.
 *
 * Deliberately only called at email capture and checkout. Identifying earlier
 * means guessing, and a confidently wrong profile is worse than an anonymous
 * one — see the identity section of docs/integration-klaviyo.md.
 */
export const identify = (email: string): void => {
  if (!KLAVIYO_PUBLIC_KEY || typeof window === "undefined" || !email) return;
  queue().push(["identify", { $email: email }]);
};
