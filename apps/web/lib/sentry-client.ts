import type * as SentryNext from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

type SentryModule = typeof SentryNext;

/**
 * Sentry in the browser, loaded after the page has finished loading.
 *
 * The SDK is about 57 KB of gzipped JavaScript. Imported up front it sat on
 * every page's critical path (home page JS 204 KB → 261 KB), so instead it's a
 * separate chunk fetched once the browser is idle. Errors raised before then
 * are queued and sent when it arrives, so nothing early is lost.
 */
let sentry: SentryModule | undefined;
let loading: Promise<SentryModule | undefined> | undefined;
const queued: unknown[] = [];

const load = (): Promise<SentryModule | undefined> => {
  if (!sentryOptions.enabled) return Promise.resolve(undefined);
  loading ??= import("@sentry/nextjs").then(
    (module) => {
      module.init(sentryOptions);
      sentry = module;
      for (const error of queued.splice(0)) module.captureException(error);
      return module;
    },
    () => undefined,
  );
  return loading;
};

/** Reports an error, loading Sentry first if it isn't in yet. */
export const reportError = (error: unknown) => {
  if (!sentryOptions.enabled) return;
  if (sentry) {
    sentry.captureException(error);
    return;
  }
  queued.push(error);
  void load();
};

/** The current Sentry module, once loaded. */
export const loadedSentry = () => sentry;

/**
 * Catches uncaught errors and rejections until the SDK takes over (its own
 * handlers replace these once it has loaded), then loads it when idle.
 */
export const startSentry = () => {
  if (!sentryOptions.enabled || typeof window === "undefined") return;
  const early = (event: ErrorEvent | PromiseRejectionEvent) => {
    if (sentry) return;
    queued.push("reason" in event ? event.reason : (event.error ?? event.message));
  };
  window.addEventListener("error", early);
  window.addEventListener("unhandledrejection", early);
  const begin = () => {
    void load().then(() => {
      window.removeEventListener("error", early);
      window.removeEventListener("unhandledrejection", early);
    });
  };
  const idle = () =>
    "requestIdleCallback" in window
      ? window.requestIdleCallback(begin)
      : setTimeout(begin, 1);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
};
