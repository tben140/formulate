import {
  toGa4,
  toMetaPixel,
  toPinterestTag,
  toRedditPixel,
  toSnapPixel,
  toTikTokPixel,
  toUet,
  type AdEvent,
} from "@formulate/analytics";

import { readConsent } from "@/lib/consent";

/**
 * Ad-platform tags in the browser: Google (GA4, optionally Google Ads), Meta,
 * TikTok, Pinterest, Snapchat, Reddit and Microsoft Advertising.
 *
 * Every id is public by design: it appears in every page that loads the tag.
 * Each tag is off while its id is unset, so local development and CI run
 * without them, and a deployment turns on only the platforms it has ids for.
 *
 * Nothing loads, and nothing is sent, without tracking consent: the same
 * cookie that gates Klaviyo (lib/consent.ts, ADR 0008). The tags load once
 * the page is idle, so they never compete with the page itself.
 *
 * Each platform below is one entry: how to start its tag (its standard queue
 * stub, then its script), how it records a page view, and how it records a
 * commerce event. The events themselves are translated in packages/analytics,
 * where they're unit-tested.
 */
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "";
export const PINTEREST_TAG_ID = process.env.NEXT_PUBLIC_PINTEREST_TAG_ID ?? "";
export const SNAP_PIXEL_ID = process.env.NEXT_PUBLIC_SNAP_PIXEL_ID ?? "";
export const REDDIT_PIXEL_ID = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID ?? "";
export const UET_TAG_ID = process.env.NEXT_PUBLIC_UET_TAG_ID ?? "";

type Command = (...args: unknown[]) => void;
/** A tag's command queue: callable, and carrying whatever its script expects. */
type Queue = Command & Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Command;
    fbq?: Queue;
    _fbq?: unknown;
    ttq?: unknown[] & Record<string, unknown>;
    pintrk?: Queue;
    snaptr?: Queue;
    rdt?: Queue;
    uetq?: { push: Command } | unknown[];
    UET?: new (options: Record<string, unknown>) => { push: Command };
  }
}

const loadScript = (src: string, onload?: () => void): void => {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  if (onload) script.addEventListener("load", onload);
  document.head.appendChild(script);
};

/**
 * The common stub shape (Meta, Pinterest, Snapchat, Reddit): calls queue up
 * until the script arrives and installs its handler under `handlerKey`.
 */
const queueStub = (handlerKey: string, queueKey: string): Queue => {
  const stub = ((...args: unknown[]) => {
    const handler = stub[handlerKey] as Command | undefined;
    if (handler) handler(...args);
    else (stub[queueKey] as unknown[]).push(args);
  }) as Queue;
  stub[queueKey] = [];
  return stub;
};

const tiktok = (): Record<string, Command> =>
  window.ttq as unknown as Record<string, Command>;
const uet = (): { push: Command } | undefined =>
  window.uetq && "push" in window.uetq ? (window.uetq as { push: Command }) : undefined;

interface Platform {
  /** How the consent banner names it. */
  readonly label: string;
  readonly on: boolean;
  /** Whether app/api/ad-events forwards this platform's server-side copy. */
  readonly server: boolean;
  readonly start: () => void;
  readonly page: () => void;
  readonly track: (event: AdEvent) => void;
}

const PLATFORMS: readonly Platform[] = [
  {
    // Google: GA4 and/or Google Ads, both through gtag.js.
    label: "Google",
    on: Boolean(GA4_ID || GOOGLE_ADS_ID),
    server: false,
    start: () => {
      window.dataLayer = window.dataLayer ?? [];
      // gtag.js reads `arguments` objects from the dataLayer, not arrays, so
      // this must be a function declaration rather than an arrow.
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
      // Page views are sent on each client-side navigation, so the automatic
      // one on load would count the first page twice.
      if (GA4_ID) window.gtag("config", GA4_ID, { send_page_view: false });
      if (GOOGLE_ADS_ID) window.gtag("config", GOOGLE_ADS_ID);
      loadScript(
        `https://www.googletagmanager.com/gtag/js?id=${GA4_ID || GOOGLE_ADS_ID}`,
      );
    },
    page: () => {
      if (!GA4_ID) return;
      window.gtag?.("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    },
    track: (event) => window.gtag?.(...toGa4(event)),
  },
  {
    label: "Meta",
    on: Boolean(META_PIXEL_ID),
    server: true,
    start: () => {
      const fbq = queueStub("callMethod", "queue");
      Object.assign(fbq, { loaded: true, version: "2.0", push: fbq });
      window.fbq = fbq;
      window._fbq = fbq;
      fbq("init", META_PIXEL_ID);
      loadScript("https://connect.facebook.net/en_US/fbevents.js");
    },
    page: () => window.fbq?.("track", "PageView"),
    track: (event) => window.fbq?.(...toMetaPixel(event)),
  },
  {
    label: "TikTok",
    on: Boolean(TIKTOK_PIXEL_ID),
    server: true,
    start: () => {
      // TikTok's snippet: an array whose methods queue their calls, plus the
      // bookkeeping events.js reads when it arrives.
      const ttq = Object.assign([] as unknown[], {}) as unknown[] &
        Record<string, unknown>;
      for (const method of [
        "page",
        "track",
        "identify",
        "instances",
        "debug",
        "on",
        "off",
        "once",
        "ready",
        "alias",
        "group",
        "enableCookie",
        "disableCookie",
      ]) {
        ttq[method] = (...args: unknown[]) => ttq.push([method, ...args]);
      }
      const base = "https://analytics.tiktok.com/i18n/pixel/events.js";
      Object.assign(ttq, {
        _i: { [TIKTOK_PIXEL_ID]: Object.assign([], { _u: base }) },
        _t: { [TIKTOK_PIXEL_ID]: Date.now() },
        _o: { [TIKTOK_PIXEL_ID]: {} },
      });
      window.ttq = ttq;
      loadScript(`${base}?sdkid=${TIKTOK_PIXEL_ID}&lib=ttq`);
    },
    page: () => tiktok().page?.(),
    track: (event) => tiktok().track?.(...toTikTokPixel(event)),
  },
  {
    label: "Pinterest",
    on: Boolean(PINTEREST_TAG_ID),
    server: true,
    start: () => {
      const pintrk = queueStub("__never", "queue");
      pintrk.version = "3.0";
      window.pintrk = pintrk;
      pintrk("load", PINTEREST_TAG_ID);
      loadScript("https://s.pinimg.com/ct/core.js");
    },
    page: () => window.pintrk?.("page"),
    track: (event) => {
      const call = toPinterestTag(event);
      if (call) window.pintrk?.(...call);
    },
  },
  {
    label: "Snapchat",
    on: Boolean(SNAP_PIXEL_ID),
    server: true,
    start: () => {
      const snaptr = queueStub("handleRequest", "queue");
      window.snaptr = snaptr;
      snaptr("init", SNAP_PIXEL_ID, {});
      loadScript("https://sc-static.net/scevent.min.js");
    },
    page: () => window.snaptr?.("track", "PAGE_VIEW"),
    track: (event) => window.snaptr?.(...toSnapPixel(event)),
  },
  {
    // Browser only: Reddit's Conversions API is left until it can be checked
    // against a live account (docs/integration-ad-pixels.md).
    label: "Reddit",
    on: Boolean(REDDIT_PIXEL_ID),
    server: false,
    start: () => {
      const rdt = queueStub("sendEvent", "callQueue");
      window.rdt = rdt;
      rdt("init", REDDIT_PIXEL_ID);
      loadScript("https://www.redditstatic.com/ads/pixel.js");
    },
    page: () => window.rdt?.("track", "PageVisit"),
    track: (event) => {
      const call = toRedditPixel(event);
      if (call) window.rdt?.(...call);
    },
  },
  {
    // Microsoft Advertising's UET. Browser only, like Reddit.
    label: "Microsoft",
    on: Boolean(UET_TAG_ID),
    server: false,
    start: () => {
      const queue: unknown[] = [];
      window.uetq = queue;
      queue.push("consent", "default", { ad_storage: "granted" });
      loadScript("https://bat.bing.com/bat.js", () => {
        if (!window.UET) return;
        // UET counts single-page navigations itself with this option, so `page` is empty.
        window.uetq = new window.UET({
          ti: UET_TAG_ID,
          enableAutoSpaTracking: true,
          q: queue,
        });
        window.uetq.push("pageLoad");
      });
    },
    page: () => {},
    track: (event) => {
      const queue = window.uetq;
      if (!queue) return;
      const call = toUet(event);
      if (Array.isArray(queue)) queue.push(...call);
      else uet()?.push(...call);
    },
  },
];

const active = PLATFORMS.filter((platform) => platform.on);
export const hasAdPixels = active.length > 0;

/** "Google, Meta and TikTok": the platforms switched on, for the consent banner. */
export const adPlatformNames = new Intl.ListFormat("en-GB", {
  type: "conjunction",
}).format(active.map((platform) => platform.label));
const hasServerCopies = active.some((platform) => platform.server);

let started = false;

/**
 * Sets up every configured tag's command queue and starts its script
 * downloading. Calls made before a script arrives wait in its queue.
 */
export const startAdPixels = (): void => {
  if (started || !hasAdPixels || readConsent() !== "granted") return;
  started = true;
  for (const platform of active) platform.start();
};

/** One id per event, shared by the browser tags and the server-side copies. */
export const newEventId = (): string => crypto.randomUUID();

export const trackPageView = (): void => {
  if (readConsent() !== "granted") return;
  startAdPixels();
  for (const platform of active) platform.page();
};

/**
 * Sends a commerce event to every configured platform, plus the server-side
 * copies (Meta, TikTok, Pinterest, Snapchat).
 *
 * The server copies go through our own route (app/api/ad-events), not
 * straight to the platforms: their APIs need secret tokens, and the route
 * adds what only the server knows. `sendBeacon` survives the page unloading,
 * which matters for Checkout, where the next thing that happens is leaving
 * the site.
 */
export const trackAd = (event: AdEvent): void => {
  if (!hasAdPixels || readConsent() !== "granted") return;
  startAdPixels();
  for (const platform of active) platform.track(event);

  if (hasServerCopies) {
    navigator.sendBeacon(
      "/api/ad-events",
      new Blob([JSON.stringify(event)], { type: "application/json" }),
    );
  }
};

/**
 * The platforms' first-party cookies, cleared when consent is withdrawn:
 * Google (`_ga*`, `_gid`, `_gcl_*`), Meta (`_fbp`, `_fbc`), TikTok (`_ttp`,
 * `_tt_enable_cookie`), Pinterest (`_pin_unauth`, `_pinterest_ct_ua`,
 * `_epik`, `_derived_epik`), Snapchat (`_scid`, `_sctr`, `_schn`), Reddit
 * (`_rdt_uuid`, `_rdt_cid`) and Microsoft (`_uetsid`, `_uetvid`).
 */
const AD_COOKIE =
  /^(_ga|_gid$|_gcl_|_fbp$|_fbc$|_ttp$|_tt_enable_cookie$|_pin_unauth$|_pinterest_ct_ua$|_epik$|_derived_epik$|_scid|_sctr$|_schn$|_rdt_uuid$|_rdt_cid$|_uetsid$|_uetvid$)/;

/** Each cookie may sit on the current host or a parent domain, so both are cleared. */
export const forgetAdCookies = (): void => {
  const labels = window.location.hostname.split(".");
  const domains =
    labels.length < 2 ? [] : labels.slice(0, -1).map((_, i) => labels.slice(i).join("."));
  const expired = "Max-Age=0; Path=/";

  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0] ?? "";
    if (!AD_COOKIE.test(name)) continue;
    document.cookie = `${name}=; ${expired}`;
    for (const domain of domains)
      document.cookie = `${name}=; ${expired}; Domain=${domain}`;
  }
};
