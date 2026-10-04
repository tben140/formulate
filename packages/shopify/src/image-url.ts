/**
 * Right-sized Shopify CDN image URLs (SHO-62).
 *
 * Shopify's CDN resizes on request (`?width=…&height=…&crop=center`). Without
 * that, a client gets the original upload: the demo packshots are 1254 px PNGs
 * of about 1.5 MB, fetched in full even for a 64 px thumbnail.
 *
 * Web doesn't need this: Hydrogen's `Image` already builds a `srcset` from the
 * same parameters. The app does, since it draws one size per image.
 *
 * ⚠️ The CDN picks the format from the request's `Accept` header, not the URL
 * (`format=webp` is ignored; checked 2026-10-04). The same 192 px image is a
 * 35 KB PNG or a 4 KB WebP depending on that header, so callers outside a
 * browser must send it too. See `WEBP_ACCEPT`.
 */

/** An `Accept` header that gets WebP from the CDN, as browsers send. */
export const WEBP_ACCEPT = "image/avif,image/webp,image/*;q=0.8";

/**
 * Sizes are rounded up to this step, so neighbouring requests (a 64 pt
 * thumbnail on a 2× and a 3× phone, say) share CDN and disk cache entries.
 */
const STEP = 64;

const roundUp = (pixels: number): number =>
  Math.max(STEP, Math.ceil(pixels / STEP) * STEP);

/**
 * `url` at `width` × `height` device pixels, cropped to fill. Only Shopify CDN
 * URLs are rewritten; anything else comes back unchanged rather than with
 * parameters some other host might reject.
 */
export const sizedImageUrl = (
  url: string,
  { width, height }: { readonly width: number; readonly height?: number },
): string => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (
    parsed.hostname !== "cdn.shopify.com" &&
    !parsed.pathname.startsWith("/cdn/shop/")
  ) {
    return url;
  }
  parsed.searchParams.set("width", String(roundUp(width)));
  if (height !== undefined) {
    parsed.searchParams.set("height", String(roundUp(height)));
    parsed.searchParams.set("crop", "center");
  }
  return parsed.toString();
};
