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
 * Screen changes become spans named after the route ("products/[handle]"),
 * never its params. Registered with Expo Router's container in
 * app/_layout.tsx.
 */
export const navigationIntegration = Sentry.reactNavigationIntegration();

/**
 * Set per EAS build profile (eas.json), so a preview build's errors are kept
 * apart from production's: both are release builds, so `__DEV__` can't tell
 * them apart, and they share the DSN.
 */
const environment =
  // `||`, not `??`: a copied .env.example leaves it empty, which means unset.
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? "development" : "production");

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
    environment,
    sendDefaultPii: false,
    tracesSampleRate,
    // ⚠️ No trace headers on any request. The SDK's default is every request,
    // which would send `sentry-trace` and `baggage` to Shopify and Klaviyo. Our
    // Worker reports errors only (apps/api/src/sentry.ts), so a trace ends at
    // the app.
    tracePropagationTargets: [],
    integrations: [navigationIntegration],
    // No release-health sessions, which the SDK sends by default.
    enableAutoSessionTracking: false,
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
    // Console breadcrumbs are dropped: a log line can carry what the shopper
    // typed (the Klaviyo warning includes the email). Network breadcrumbs keep
    // the endpoint, never the query.
    beforeBreadcrumb: (breadcrumb) => {
      if (breadcrumb.category === "console") return null;
      const url = breadcrumb.data?.url;
      if (typeof url === "string" && breadcrumb.data)
        breadcrumb.data.url = stripQuery(url);
      return breadcrumb;
    },
    // Traces carry URLs, headers and the user too. See packages/analytics.
    beforeSendTransaction: (event) => scrubTransaction(event),
  });
};
