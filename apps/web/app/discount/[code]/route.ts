import { campaignHandleFromPath, safeRedirectPath } from "@formulate/shopify";
import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, cookieOptions, parseAccess } from "@/lib/campaign";
import { cartClient, readCartId, writeCartId } from "@/lib/cart";

/**
 * An email link's discount (SHO-169): `/discount/<code>?redirect=<path>`, the
 * same URL Shopify's theme handles itself.
 *
 * Adds the code to the cart (making one if needed), then opens `redirect`. If
 * that's a campaign page, this browser is remembered as having the link, so
 * an email-only campaign shows its banner and badges here for 30 days.
 *
 * Shopify decides whether the code is valid, at checkout as always. A bad
 * code still redirects: the page says nothing about codes, and the cart
 * simply shows no discount.
 */
export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) => {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().slice(0, 255);
  const redirect = safeRedirectPath(request.nextUrl.searchParams.get("redirect"));

  if (code) {
    const result = await cartClient.applyDiscountCode(await readCartId(), code);
    if (result.ok) await writeCartId(result.data.id);
  }

  const response = NextResponse.redirect(new URL(redirect, request.url));
  const handle = campaignHandleFromPath(redirect);
  if (handle) {
    const access = parseAccess(request.cookies.get(ACCESS_COOKIE)?.value).filter(
      (known) => known !== handle,
    );
    response.cookies.set(
      ACCESS_COOKIE,
      [...access, handle].join(","),
      cookieOptions(60 * 60 * 24 * 30),
    );
  }
  response.headers.set("cache-control", "no-store");
  return response;
};
