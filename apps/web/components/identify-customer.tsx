"use client";

import { useEffect } from "react";

import { identifyCustomer } from "@/lib/product-analytics";

import { useTrackingConsent } from "./tracking-consent";

/**
 * Tells PostHog who the signed-in shopper is (SHO-172). Rendered by the
 * account page, which is where sign-in lands. Renders nothing.
 *
 * Runs again when consent changes: a first-time visitor may accept the banner
 * on this very page, and nothing is sent before that. A repeat for the same
 * pair is ignored (identifyCustomer).
 */
export const IdentifyCustomer = ({ customerId }: { readonly customerId: string }) => {
  const consent = useTrackingConsent();
  useEffect(() => {
    if (consent === "granted") identifyCustomer(customerId);
  }, [customerId, consent]);
  return null;
};
