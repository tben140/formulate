"use client";

import { useEffect } from "react";

import { markCampaignSeen } from "@/app/actions/cart";

/**
 * Records a visit to a campaign page (SHO-169), so the cart is tagged with
 * the campaign (`_campaign`) for `campaigns report`. After the page has
 * loaded, not during render: a server component can't set the cookie, and
 * the page itself stays cacheable.
 */
export const CampaignSeen = ({ handle }: { readonly handle: string }) => {
  useEffect(() => {
    void markCampaignSeen(handle).catch(() => undefined);
  }, [handle]);
  return null;
};
