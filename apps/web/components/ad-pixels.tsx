"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { startAdPixels, trackPageView } from "@/lib/ad-pixels";

/**
 * Starts Google's and Meta's tags once the page is idle, and records a page
 * view on every client-side navigation (Next doesn't reload the page, so the
 * tags can't see these on their own).
 *
 * Mounted by TrackingConsentProvider only while consent is granted, so
 * accepting on a page starts the tags there and then.
 */
export const AdPixels = () => {
  const pathname = usePathname();

  useEffect(() => {
    const idle =
      window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1));
    idle(() => startAdPixels());
  }, []);

  useEffect(() => {
    trackPageView();
  }, [pathname]);

  return null;
};
