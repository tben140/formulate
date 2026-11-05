import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/sentry";

// Server errors. @sentry/nextjs resolves to its server build here, so the same
// options serve pages, route handlers and any edge code.
export const register = () => {
  Sentry.init(sentryOptions);
};

// Errors thrown while Next renders a Server Component or runs a route handler.
export const onRequestError = Sentry.captureRequestError;
