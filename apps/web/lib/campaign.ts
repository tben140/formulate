import {
  activeCampaign,
  campaignNow,
  CampaignsQuery,
  toCampaign,
  type CampaignView,
} from "@formulate/shopify";
import { createHmac, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";

import { storefront } from "./storefront";

/**
 * Campaigns on web (SHO-169). Pages render per request, so a campaign appears
 * and disappears on its dates with nothing to revalidate. A page left open
 * across a date refreshes itself (`CampaignRefresh`).
 *
 * Who's looking (`CampaignView`) comes from two cookies:
 * - `campaign_preview`: a campaign opened through its preview link
 *   (`/pages/campaigns/<handle>/preview?token=…`), shown as live in this
 *   browser only, until "Stop preview". Signed with the preview secret, so
 *   it can't be written by hand.
 * - `campaign_access`: email-link campaigns this browser reached through
 *   `/discount/<code>?redirect=/pages/campaigns/<handle>`. Not signed: anyone
 *   can see the page by URL anyway, and the single-use code is the gate.
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

/** The preview secret, or null when previews are off (unset or too short). */
const previewSecret = (): string | null => {
  const secret = process.env.CAMPAIGN_PREVIEW_TOKEN ?? "";
  return secret.length >= 24 ? secret : null;
};

const sign = (handle: string, secret: string): string =>
  createHmac("sha256", secret).update(`campaign-preview:${handle}`).digest("base64url");

/** The preview cookie's value for a handle: `<handle>.<signature>`. */
export const previewCookieValue = (handle: string): string | null => {
  const secret = previewSecret();
  return secret ? `${handle}.${sign(handle, secret)}` : null;
};

/** The handle in a preview cookie, if its signature is right. */
export const readPreviewCookie = (value: string | undefined): string | null => {
  const secret = previewSecret();
  const [handle = "", mac = ""] = (value ?? "").split(".");
  if (!secret || !HANDLE.test(handle)) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(handle, secret));
  return a.length === b.length && timingSafeEqual(a, b) ? handle : null;
};

export const campaignView = cache(
  async (): Promise<CampaignView & { readonly clockPreview: boolean }> => {
    const jar = await cookies();
    const previewAt =
      process.env.VERCEL_ENV === "production" ? null : process.env.CAMPAIGN_PREVIEW_AT;
    const now = campaignNow(previewAt);
    return {
      now,
      // Whether `now` is a preview time rather than the real clock, so a
      // countdown knows whether to keep the server's offset (CampaignEnds).
      clockPreview:
        Boolean(previewAt) && now.getTime() === new Date(previewAt ?? "").getTime(),
      preview: readPreviewCookie(jar.get(PREVIEW_COOKIE)?.value),
      access: new Set(parseAccess(jar.get(ACCESS_COOKIE)?.value)),
    };
  },
);

/**
 * Every campaign, the same for every visitor, so cached for a minute rather
 * than fetched on each page view. Who sees what is worked out after, per
 * request. A failed request isn't cached.
 */
const cachedCampaignNodes = unstable_cache(
  async () => {
    const result = await storefront.request(CampaignsQuery, {});
    if (!result.ok) throw new Error("campaigns unavailable");
    return result.data.metaobjects.nodes;
  },
  ["campaign-nodes"],
  { revalidate: 60 },
);

export const getCampaignNodes = cache(async () => {
  try {
    return await cachedCampaignNodes();
  } catch {
    return null;
  }
});

/** The campaign to show site-wide, or null. A failed request shows no banner. */
export const getActiveCampaign = cache(async () => {
  const nodes = await getCampaignNodes();
  return nodes ? activeCampaign(nodes, await campaignView()) : null;
});

/**
 * The next time any campaign starts or ends, within a day, as epoch ms: when
 * a page left open should refresh. Null if nothing changes within a day.
 */
export const getNextCampaignChange = cache(async (): Promise<number | null> => {
  const nodes = await getCampaignNodes();
  if (!nodes) return null;
  const now = (await campaignView()).now.getTime();
  const times = nodes
    .map(toCampaign)
    .flatMap((campaign) =>
      campaign ? [campaign.startsAt.getTime(), campaign.endsAt.getTime()] : [],
    )
    .filter((time) => time > now && time - now <= 24 * 60 * 60 * 1000);
  return times.length > 0 ? Math.min(...times) : null;
});

/**
 * Whether a preview link's token is right. `CAMPAIGN_PREVIEW_TOKEN` is a
 * secret set in Vercel (and the same value nowhere else); without it, or with
 * a short one, previews are off. Compared in constant time.
 */
export const isPreviewToken = (token: string | null): boolean => {
  const secret = previewSecret();
  if (!secret || !token) return false;
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
