"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refreshes the page's server components when a campaign starts or ends, so
 * a tab left open doesn't keep advertising an offer that has finished (or
 * miss one that has begun). The layout isn't re-rendered on client-side
 * navigation, so without this the banner would wait for a full reload.
 *
 * `at` is epoch ms, within a day (the layout passes nothing further out).
 */
export const CampaignRefresh = ({ at }: { at: number }) => {
  const router = useRouter();
  useEffect(() => {
    // A second's margin, so the server's clock is past the boundary too.
    const timer = setTimeout(() => router.refresh(), Math.max(0, at - Date.now()) + 1000);
    return () => clearTimeout(timer);
  }, [at, router]);
  return null;
};
