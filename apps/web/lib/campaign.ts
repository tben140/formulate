import {
  activeCampaign,
  campaignNow,
  CampaignsQuery,
  type CampaignView,
} from "@formulate/shopify";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * Campaigns on web (SHO-169). Pages render per request, so a campaign appears
 * and disappears on its dates with nothing to revalidate.
 *
 * Who's looking (`CampaignView`) comes from two cookies:
 * - `campaign_preview`: a campaign opened through its preview link
 *   (`/pages/campaigns/<handle>/preview?token=…`), shown as live in this
 *   browser only, until "Stop preview".
 * - `campaign_access`: email-link campaigns this browser reached through
 *   `/discount/<code>?redirect=/pages/campaigns/<handle>`.
 *
 * `CAMPAIGN_PREVIEW_AT` (an ISO time) moves the clock instead, for local
 * checks. Ignored in production.
 */

export const PREVIEW_COOKIE = "campaign_preview";
export const ACCESS_COOKIE = "campaign_access";

/** A campaign handle as Shopify makes them; anything else in a cookie is ignored. */
const HANDLE = /^[a-z0-9-]{1,64}$/;

/** At most this many email-link campaigns remembered per browser. */
const MAX_ACCESS = 10;

export const parseAccess = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .filter((handle) => HANDLE.test(handle))
    .slice(-MAX_ACCESS);

export const isCampaignHandle = (value: string): boolean => HANDLE.test(value);

export const campaignView = cache(async (): Promise<CampaignView> => {
  const jar = await cookies();
  const preview = jar.get(PREVIEW_COOKIE)?.value;
  return {
    now: campaignNow(
      process.env.VERCEL_ENV === "production" ? null : process.env.CAMPAIGN_PREVIEW_AT,
    ),
    preview: preview && HANDLE.test(preview) ? preview : null,
    access: new Set(parseAccess(jar.get(ACCESS_COOKIE)?.value)),
  };
});

/** The campaign to show site-wide, or null. A failed request shows no banner. */
export const getActiveCampaign = cache(async () => {
  const result = await storefront.request(CampaignsQuery, {});
  return result.ok
    ? activeCampaign(result.data.metaobjects.nodes, await campaignView())
    : null;
});

/**
 * Whether a preview link's token is right. `CAMPAIGN_PREVIEW_TOKEN` is a
 * secret set in Vercel (and the same value nowhere else); without it, or with
 * a short one, previews are off. Compared in constant time.
 */
export const isPreviewToken = (token: string | null): boolean => {
  const secret = process.env.CAMPAIGN_PREVIEW_TOKEN ?? "";
  if (secret.length < 24 || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});
