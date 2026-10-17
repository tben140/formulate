/**
 * Tracking consent for the web app — the gate in front of Klaviyo onsite.
 *
 * ⚠️ This is **not** marketing-email consent. That is recorded by Klaviyo when
 * someone submits the email capture form, and it has its own legal weight. This
 * is PECR consent: permission to set Klaviyo's `__kla_id` cookie and send
 * behavioural events (`Viewed Product`, `Added to Cart`, `Started Checkout`).
 * Signing up for emails does not grant it. See ADR 0008.
 *
 * One first-party cookie is the single source of truth. The server reads it to
 * decide whether `klaviyo.js` is in the page at all; the browser reads it before
 * every event. Nothing else stores the choice, so the two cannot disagree.
 *
 * Isomorphic on purpose: no `"use client"`, no `next/headers`. The server side
 * passes in what `cookies()` returned; the browser side reads `document.cookie`.
 */

/** Strictly necessary: it records the refusal, so it cannot itself need consent. */
export const CONSENT_COOKIE = "formulate_tracking_consent";

/**
 * Six months, then ask again.
 *
 * Long enough that returning shoppers are not nagged, short enough that a
 * choice made once does not stand indefinitely. Shopify's own banner re-asks on
 * a similar cadence.
 */
const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/**
 * `unset` is a real state, not a default for `denied`.
 *
 * Both send nothing. They differ in what happens to events fired meanwhile:
 * `unset` holds them in memory in case the shopper accepts on this page, the
 * same as the theme; `denied` drops them. See `track` in lib/klaviyo.ts.
 */
export type TrackingConsent = "granted" | "denied" | "unset";

export const parseConsent = (value: string | undefined): TrackingConsent =>
  value === "granted" || value === "denied" ? value : "unset";

/** Browser only. Returns `unset` on the server rather than throwing. */
export const readConsent = (): TrackingConsent => {
  if (typeof document === "undefined") return "unset";

  const entry = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${CONSENT_COOKIE}=`));

  return parseConsent(entry?.slice(CONSENT_COOKIE.length + 1));
};

/** Browser only. `Secure` whenever the page is, so previews and production get it. */
export const writeConsent = (consent: Exclude<TrackingConsent, "unset">): void => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${consent}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;
};
