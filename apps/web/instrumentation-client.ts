import type { captureRouterTransitionStart } from "@sentry/nextjs";

import { loadedSentry, startSentry } from "@/lib/sentry-client";

// Browser errors. Sentry itself loads once the page is idle (see
// lib/sentry-client.ts); errors before then are queued, not lost.
startSentry();

// Names each page navigation, so an error is filed under the page it happened
// on. Without tracing enabled, nothing else is recorded.
export const onRouterTransitionStart = (
  ...args: Parameters<typeof captureRouterTransitionStart>
) => loadedSentry()?.captureRouterTransitionStart(...args);
