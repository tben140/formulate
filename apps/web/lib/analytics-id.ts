import { parseExperimentId } from "@formulate/experiments";

/**
 * The visitor's anonymous analytics id, in a first-party cookie, so the server
 * can read it when deciding an experiment's variant (ADR 0013). The same id
 * PostHog's events carry, so exposures, funnels and orders join on it.
 *
 * ⚠️ Set only after the shopper accepts tracking (ADR 0008): lib/product-analytics.ts
 * writes it from `identity()`, which runs only for a consented client. Removed
 * on withdrawal with the rest of the analytics storage.
 *
 * Isomorphic, like lib/consent.ts: the server passes in what `cookies()`
 * returned; the browser reads `document.cookie`.
 */
export const ANALYTICS_ID_COOKIE = "formulate_analytics_id";

/** As long as the consent it depends on (lib/consent.ts). */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** Browser only. Null on the server, or when the cookie is missing or malformed. */
export const readAnalyticsId = (): string | null => {
  if (typeof document === "undefined") return null;
  const entry = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${ANALYTICS_ID_COOKIE}=`));
  return parseExperimentId(entry?.slice(ANALYTICS_ID_COOKIE.length + 1));
};

/** Browser only. Refreshes the expiry each time, like the consent cookie's six months. */
export const writeAnalyticsId = (id: string): void => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ANALYTICS_ID_COOKIE}=${id}; Path=/; Max-Age=${MAX_AGE_SECONDS}` +
    `; SameSite=Lax${secure}`;
};

/** Browser only. On withdrawal of consent. */
export const clearAnalyticsId = (): void => {
  document.cookie = `${ANALYTICS_ID_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};
