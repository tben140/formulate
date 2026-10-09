"use client";

import Link from "next/link";
import { useEffect } from "react";

import { reportError } from "@/lib/sentry-client";

/**
 * What a shopper sees when a page throws while rendering: something the
 * Storefront Result type didn't anticipate. Expected failures (a bad token,
 * a network error) never get here; they render StorefrontErrorState inside
 * the page.
 *
 * Offers a retry, because most unexpected errors are transient, and a way out.
 * The retry is Next's `unstable_retry`, which fetches the page from the
 * server again. `reset` only re-renders what's already in the browser, so
 * after a Storefront failure it showed the same error again (Next 16.2 docs:
 * "In most cases, you should use unstable_retry() instead").
 * The error itself goes to the console and to Sentry, not the page: its
 * message is for developers, and can contain internals a shopper shouldn't see.
 */
export const ErrorState = ({
  error,
  unstable_retry: retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) => {
  useEffect(() => {
    console.error(error);
    reportError(error);
  }, [error]);

  return (
    <div role="alert" className="py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-foreground-muted">
        This page couldn&apos;t be loaded. Please try again.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700"
        >
          Try again
        </button>
        <Link href="/" className="text-sm text-brand-600 underline underline-offset-4">
          Back to shopping
        </Link>
      </div>
      {error.digest ? (
        // Matches the server log entry, so a shopper's report can be traced.
        <p className="mt-6 text-xs text-foreground-muted">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
};
