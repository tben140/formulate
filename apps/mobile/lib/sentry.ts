import { scrubTransaction, stripQuery } from "@formulate/analytics";
import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Share of app sessions traced. eas.json sets it per build profile: every
 * session in preview builds, 10% in production. Unset (local runs) means
 * every session in development and 10% otherwise.
 */
const tracesSampleRate = (() => {
  const configured = Number.parseFloat(
    process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "",
  );
  if (Number.isFinite(configured) && configured >= 0 && configured <= 1)
    return configured;
  return __DEV__ ? 1 : 0.1;
})();

/**
 * Our Worker (apps/api), the one service that continues the app's traces.
 *
 * ⚠️ The only place trace headers go. The SDK's default is every request, which
 * would send `sentry-trace` and `baggage` to Shopify and Klaviyo too.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/**
 * Screen changes become spans named after the route ("products/[handle]"),
 * never its params. Registered with Expo Router's container in
 * app/_layout.tsx.
 */
export const navigationIntegration = Sentry.reactNavigationIntegration();

/**
 * Sentry for the Expo app (EU region, project `app`).
 *
 * JavaScript errors, and traces: app start, screen changes and network
 * requests, joined up with the Worker's own spans when the app calls it. No
 * session replay, no personal data. Without a DSN (local runs, forks) it
 * stays off. The DSN is public by design, so EXPO_PUBLIC_ is right for it.
 *
 * In Expo Go the native layer is missing, so native crashes (as opposed to
 * JavaScript errors) are only caught in a development or store build.
 *
 * Started at module scope in app/_layout.tsx, like Klaviyo, so an error
 * during the first render is caught too.
 */
export const initSentry = () => {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: __DEV__ ? "development" : "production",
    sendDefaultPii: false,
    tracesSampleRate,
    tracePropagationTargets: API_BASE_URL ? [API_BASE_URL] : [],
    integrations: [navigationIntegration],
    beforeSend: (event) => {
      delete event.user;
      if (event.request) {
        if (event.request.url) event.request.url = stripQuery(event.request.url);
        delete event.request.query_string;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.data;
      }
      return event;
    },
    // Network breadcrumbs keep the endpoint, never the query.
    beforeBreadcrumb: (breadcrumb) => {
      const url = breadcrumb.data?.url;
      if (typeof url === "string" && breadcrumb.data)
        breadcrumb.data.url = stripQuery(url);
      return breadcrumb;
    },
    // Traces carry URLs, headers and the user too. See packages/analytics.
    beforeSendTransaction: (event) => scrubTransaction(event),
  });
};
