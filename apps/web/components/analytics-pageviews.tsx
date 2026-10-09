"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { analytics } from "@/lib/product-analytics";

/**
 * Sends a PostHog page view on each client-side navigation (SHO-87). App
 * Router navigations don't reload the page, so nothing else would notice.
 *
 * Renders nothing; does nothing without consent (`analytics()` is null).
 */
export const AnalyticsPageviews = () => {
  const pathname = usePathname();
  // Strict Mode runs effects twice in development; one view per path.
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === pathname) return;
    last.current = pathname;
    analytics()?.pageview();
  }, [pathname]);

  return null;
};
