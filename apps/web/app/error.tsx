"use client";

import { ErrorState } from "@/components/error-state";

/**
 * The error boundary for every route below the root layout. The header, cart
 * and footer stay in place around it, so a failing page never becomes a
 * white screen or strands the shopper's cart.
 */
const RouteError = (props: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) => <ErrorState {...props} />;

export { RouteError as default };
