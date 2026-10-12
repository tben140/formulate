import { scrubTransaction } from "@formulate/analytics";
import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Settings shared by the browser, Node and edge Sentry clients.
 *
 * Errors, no session replay, no personal data. Without a DSN (local
 * development, forks) Sentry stays off entirely. The server also traces: see
 * serverSentryOptions.
 *
 * The DSN is public by design: it can only submit events to one project, so
 * it is safe as NEXT_PUBLIC_. The Sentry auth token, which uploads source maps
 * and can read the project, is a different thing and never belongs here.
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  beforeSend: (event: ErrorEvent) => scrubEvent(event),
  beforeBreadcrumb: <B extends { data?: Record<string, unknown> }>(breadcrumb: B) =>
    scrubBreadcrumb(breadcrumb),
};

/**
 * The server's settings: the shared ones plus tracing.
 *
 * Traces show where a request's time went: rendering, Server Actions, route
 * handlers and each call to Shopify, Klaviyo or an ad platform. 10% of
 * production requests, every request in previews and development.
 *
 * Server only. The browser keeps sentryOptions, with no tracing: browser
 * tracing would put its code back on the critical path that
 * lib/sentry-client.ts keeps it off.
 *
 * ⚠️ tracePropagationTargets is empty: no outgoing request gets trace
 * headers. Every service the server calls belongs to someone else (Shopify,
 * Klaviyo, Meta, TikTok…). The SDK's default is every request.
 *
 * Traces carry URLs, headers, IPs and the user, like errors, so
 * scrubTransaction (packages/analytics) strips them.
 */
export const serverSentryOptions = {
  ...sentryOptions,
  tracesSampleRate: sentryOptions.environment === "production" ? 0.1 : 1,
  tracePropagationTargets: [],
  beforeSendTransaction: scrubTransaction,
};

/**
 * Drops the query string and fragment. Shopify's sign-in callback carries an
 * authorization `code` and `state` there, and search pages carry what the
 * shopper typed; neither belongs in an error report.
 */
export const stripQuery = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    if (event.request.url) event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
  }
  delete event.user;
  return event;
};

export const scrubBreadcrumb = <B extends { data?: Record<string, unknown> }>(
  breadcrumb: B,
): B => {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      const value = data[key];
      if (typeof value === "string") data[key] = stripQuery(value);
    }
  }
  return breadcrumb;
};
