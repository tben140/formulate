import { notFound } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import {
  cookieOptions,
  isCampaignHandle,
  isPreviewToken,
  PREVIEW_COOKIE,
} from "@/lib/campaign";

/**
 * A campaign's preview link (SHO-169):
 * `/pages/campaigns/<handle>/preview?token=<CAMPAIGN_PREVIEW_TOKEN>`.
 *
 * Shows the whole site as if that campaign were live, in this browser only,
 * for a day or until "Stop preview". Only what's shown changes: Shopify still
 * applies the discount on its own dates. A wrong token is a plain 404, so the
 * link's existence isn't confirmed to anyone guessing.
 */
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> },
) => {
  const { handle } = await params;
  if (
    !isCampaignHandle(handle) ||
    !isPreviewToken(request.nextUrl.searchParams.get("token"))
  )
    notFound();
  const response = NextResponse.redirect(
    new URL(`/pages/campaigns/${handle}`, request.url),
  );
  response.cookies.set(PREVIEW_COOKIE, handle, cookieOptions(60 * 60 * 24));
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
};
