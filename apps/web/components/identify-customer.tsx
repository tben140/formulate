"use client";

import { useEffect } from "react";

import { identifyCustomer } from "@/lib/product-analytics";

/**
 * Tells PostHog who the signed-in shopper is (SHO-172). Rendered by the
 * account page, which is where sign-in lands. Renders nothing.
 */
export const IdentifyCustomer = ({ customerId }: { readonly customerId: string }) => {
  useEffect(() => identifyCustomer(customerId), [customerId]);
  return null;
};
