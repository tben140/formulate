"use client";

import { useSyncExternalStore } from "react";

import { storedDistinctId } from "@/lib/product-analytics";

const noSubscription = () => () => undefined;

/**
 * Sends the visitor's PostHog id with an add to cart, so a cart the server
 * creates can carry it to checkout, where the custom pixel credits the order
 * to this visitor (packages/analytics, `cartAttributes`).
 *
 * Rendered only with tracking consent, and the server checks the consent
 * cookie again before using it. Nothing on the server render: the id lives in
 * localStorage, so the field appears once the page is in the browser, and a
 * form submitted without JavaScript simply goes without it.
 */
export const AnalyticsIdField = () => {
  const id = useSyncExternalStore(noSubscription, storedDistinctId, () => null);
  return id ? <input type="hidden" name="analyticsId" value={id} /> : null;
};
