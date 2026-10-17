import { toGa4, toMetaPixel, type AdEvent } from "@formulate/analytics";

import { readConsent } from "@/lib/consent";

/**
 * Google (GA4, optionally Google Ads) and the Meta Pixel, in the browser.
 *
 * All three ids are public by design: they appear in every page that loads
 * the tags. Each tag is off while its id is unset, so local development and
 * CI run without them.
 *
 * Nothing loads, and nothing is sent, without tracking consent: the same
 * cookie that gates Klaviyo (lib/consent.ts, ADR 0008). The tags load once
 * the page is idle, so they never compete with the page itself.
 */
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

const hasGoogle = Boolean(GA4_ID || GOOGLE_ADS_ID);
const hasMeta = Boolean(META_PIXEL_ID);
export const hasAdPixels = hasGoogle || hasMeta;

type Command = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Command;
    fbq?: Command & {
      queue?: unknown[];
      callMethod?: Command;
      push?: Command;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  }
}

const loadScript = (src: string): void => {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  document.head.appendChild(script);
};

let started = false;

/**
 * Sets up both tags' command queues and starts their scripts downloading.
 * Calls made before the scripts arrive wait in the queues, so nothing is lost.
 */
export const startAdPixels = (): void => {
  if (started || !hasAdPixels || readConsent() !== "granted") return;
  started = true;

  if (hasGoogle) {
    window.dataLayer = window.dataLayer ?? [];
    // gtag.js reads `arguments` objects from the dataLayer, not arrays, so this
    // must be a function declaration rather than an arrow.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
    // Consent Mode v2. The tags only load after the shopper has accepted, so
    // every signal is granted. Google requires these to be stated for UK and
    // EEA traffic before ads features use the data.
    window.gtag("consent", "default", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
    window.gtag("js", new Date());
    // Page views are sent on each client-side navigation (components/ad-pixels.tsx),
    // so the automatic one on load would count the first page twice.
    if (GA4_ID) window.gtag("config", GA4_ID, { send_page_view: false });
    if (GOOGLE_ADS_ID) window.gtag("config", GOOGLE_ADS_ID);
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID || GOOGLE_ADS_ID}`);
  }

  if (hasMeta) {
    // Meta's standard queue stub, unminified.
    const fbq: NonNullable<Window["fbq"]> = Object.assign(
      (...args: unknown[]) => {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue?.push(args);
      },
      { queue: [] as unknown[], loaded: true, version: "2.0" },
    );
    // Meta's snippet sets this too; fbevents.js may call it.
    fbq.push = fbq;
    window.fbq = fbq;
    window._fbq = fbq;
    fbq("init", META_PIXEL_ID);
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
  }
};

/** One id per event, shared by the browser tag and the server-side copy. */
export const newEventId = (): string => crypto.randomUUID();

export const trackPageView = (): void => {
  if (readConsent() !== "granted") return;
  startAdPixels();
  if (GA4_ID) {
    window.gtag?.("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
  }
  if (hasMeta) window.fbq?.("track", "PageView");
};

/**
 * Sends a commerce event to Google and Meta, plus Meta's server-side copy.
 *
 * The server copy goes through our own route (app/api/ad-events), not
 * straight to Meta: the Conversions API needs a secret token, and the route
 * adds what only the server knows. `sendBeacon` survives the page unloading,
 * which matters for Checkout, where the next thing that happens is leaving
 * the site.
 */
export const trackAd = (event: AdEvent): void => {
  if (!hasAdPixels || readConsent() !== "granted") return;
  startAdPixels();

  if (hasGoogle) window.gtag?.(...toGa4(event));
  if (hasMeta) {
    window.fbq?.(...toMetaPixel(event));
    navigator.sendBeacon(
      "/api/ad-events",
      new Blob([JSON.stringify(event)], { type: "application/json" }),
    );
  }
};

/**
 * Clears Google's and Meta's first-party cookies when consent is withdrawn:
 * `_ga*` and `_gid` (Analytics), `_gcl_*` (Ads), and `_fbp`/`_fbc` (Meta).
 * Each may sit on the current host or a parent domain, so both are cleared.
 */
export const forgetAdCookies = (): void => {
  const labels = window.location.hostname.split(".");
  const domains =
    labels.length < 2 ? [] : labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));
  const expired = "Max-Age=0; Path=/";

  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0] ?? "";
    if (!/^(_ga|_gid$|_gcl_|_fbp$|_fbc$)/.test(name)) continue;
    document.cookie = `${name}=; ${expired}`;
    for (const domain of domains)
      document.cookie = `${name}=; ${expired}; Domain=${domain}`;
  }
};
