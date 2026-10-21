import { NextResponse, type NextRequest } from "next/server";

import { cartClient } from "@/lib/cart";

/**
 * Cart permalinks for the product page's Shop Pay button: `/cart/{variant
 * id}:{quantity}?payment=shop_pay`, the path Hydrogen's ShopPayButton links
 * to when it's given no checkoutUrl.
 *
 * Why here and not on the store's own domain: Shopify serves permalinks from
 * its online store, which this store keeps behind a password, so a permalink
 * there lands on the password page. This builds the same thing through the
 * Storefront API, the way Hydrogen's own route handler does: a new cart with
 * just these lines (the shopper's cart is untouched), then its checkout, with
 * Shop Pay's query parameters carried across.
 *
 * GET, because it's a link. robots.txt keeps crawlers out (app/robots.ts).
 */

const MAX_LINES = 10;

/** "52871791378744:1,123:2" as cart lines, or null when it isn't one. */
const parseLines = (segment: string) => {
  const parts = decodeURIComponent(segment).split(",");
  if (parts.length === 0 || parts.length > MAX_LINES) return null;
  const lines = parts.map((part) => {
    const match = /^(\d{1,20}):([1-9]\d{0,2})$/.exec(part);
    return match
      ? {
          merchandiseId: `gid://shopify/ProductVariant/${match[1]}`,
          quantity: Number(match[2]),
        }
      : null;
  });
  return lines.every(Boolean) ? (lines as NonNullable<(typeof lines)[number]>[]) : null;
};

/** Shop Pay's own parameters; anything else is dropped. */
const CARRIED = ["payment", "source", "source_token", "channel"];

export const GET = async (
  request: NextRequest,
  { params }: { params: Promise<{ lines: string }> },
) => {
  const lines = parseLines((await params).lines);
  if (!lines) return NextResponse.redirect(new URL("/", request.url), 303);

  const result = await cartClient.create({ lines });
  if (!result.ok || !result.data?.checkoutUrl) {
    // Back where they came from, where the normal add to cart still works.
    return NextResponse.redirect(
      new URL(request.headers.get("referer") ?? "/", request.url),
      303,
    );
  }

  const checkout = new URL(result.data.checkoutUrl);
  for (const name of CARRIED) {
    const value = request.nextUrl.searchParams.get(name);
    if (value) checkout.searchParams.set(name, value);
  }
  return NextResponse.redirect(checkout, 303);
};
