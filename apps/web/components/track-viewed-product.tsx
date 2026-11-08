"use client";

import {
  EVENTS,
  PRODUCT_EVENTS,
  type ProductEventProperties,
  type ViewedProductPayload,
} from "@formulate/analytics";
import { useEffect, useRef } from "react";

import { track } from "@/lib/klaviyo";
import { analytics } from "@/lib/product-analytics";

/**
 * Fires `Viewed Product` for the product page.
 *
 * The payload is built on the **server** and passed in as a prop, so the store
 * domain stays out of the client bundle. Only the emitting needs a browser;
 * the shaping does not.
 *
 * Renders nothing. It exists purely so a Server Component can reach a
 * browser-only API without becoming a Client Component itself — the same
 * pattern `<Analytics />` uses.
 */
export const TrackViewedProduct = ({
  payload,
  productViewed,
}: {
  readonly payload: ViewedProductPayload;
  /** PostHog's product_viewed (SHO-87), also built on the server. */
  readonly productViewed: ProductEventProperties["product_viewed"];
}) => {
  // React Strict Mode runs effects twice in development. Without this guard
  // every local page view would post two events, and the Klaviyo feed used to
  // verify this work would be quietly wrong.
  const sent = useRef<number | null>(null);

  useEffect(() => {
    if (sent.current === payload.ProductID) return;
    sent.current = payload.ProductID;
    track(EVENTS.viewedProduct, payload);
    analytics()?.capture(PRODUCT_EVENTS.productViewed, productViewed);
  }, [payload, productViewed]);

  return null;
};
