"use client";

import { PRODUCT_EVENTS } from "@formulate/analytics";
import type { Exposure } from "@formulate/experiments";
import { useEffect, useRef } from "react";

import { analytics } from "@/lib/product-analytics";

/**
 * Records that the visitor was shown an experiment's variant (ADR 0013).
 *
 * The server decides the variant; this sends `experiment_viewed` once the page
 * is actually on screen, so prefetches and crawlers, which never run effects,
 * are never counted. Renders nothing, and sends nothing without consent
 * (`analytics()` is null), which matches the server: without consent there is
 * no exposure to send.
 */
export const ExperimentExposure = ({ exposure }: { readonly exposure: Exposure }) => {
  const { experiment_key, variation_id } = exposure;
  // Strict Mode runs effects twice in development: one exposure per variant,
  // as in TrackViewedProduct.
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const key = `${experiment_key}:${variation_id}`;
    if (sent.current === key) return;
    sent.current = key;
    analytics()?.capture(PRODUCT_EVENTS.experimentViewed, {
      experiment_key,
      variation_id,
    });
  }, [experiment_key, variation_id]);

  return null;
};
