import * as Sentry from "@sentry/nextjs";

import { serverSentryOptions } from "@/lib/sentry";

// Server errors and traces. @sentry/nextjs resolves to its server build here,
// so the same options serve pages, route handlers and any edge code.
export const register = () => {
  Sentry.init(serverSentryOptions);
};

// Errors thrown while Next renders a Server Component or runs a route handler.
export const onRequestError = Sentry.captureRequestError;
