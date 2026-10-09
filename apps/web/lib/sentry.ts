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
