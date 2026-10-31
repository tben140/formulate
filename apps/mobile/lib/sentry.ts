import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Drops the query string and fragment, where search text and tokens travel. */
const stripQuery = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;

/**
 * Sentry for the Expo app (EU region, project `app`).
 *
 * JavaScript errors only: no tracing, no session replay, no personal data.
 * Without a DSN (local runs, forks) it stays off. The DSN is public by
 * design, so EXPO_PUBLIC_ is right for it.
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
  });
};
