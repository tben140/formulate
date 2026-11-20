import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Settings shared by the browser, Node and edge Sentry clients.
 *
 * Errors only: no tracing, no session replay, no personal data. Without a DSN
 * (local development, forks) Sentry stays off entirely.
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
  /*
   * React's streaming renderer logs this whenever a visitor leaves a page
   * before it finishes arriving (a closed tab, a fast click, a weak signal).
   * Nothing is wrong and the shopper isn't affected, but as an error event it
   * would fill the free plan's quota and bury real issues (investigated
   * 2026-10-18; Ben chose to ignore it on 2026-10-19).
   */
  ignoreErrors: ["The destination stream closed early."],
  beforeSend: (event: ErrorEvent) => scrubEvent(event),
  beforeBreadcrumb: <B extends { data?: Record<string, unknown> }>(breadcrumb: B) =>
    scrubBreadcrumb(breadcrumb),
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
  // Sentry's Next.js integration also copies a failed server request's path,
  // query included, into contexts.nextjs.request_path (CodeRabbit on #97).
  // A failed sign-in callback would otherwise send its authorisation code.
  const nextjs = event.contexts?.nextjs as { request_path?: unknown } | undefined;
  if (nextjs && typeof nextjs.request_path === "string") {
    nextjs.request_path = stripQuery(nextjs.request_path);
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
