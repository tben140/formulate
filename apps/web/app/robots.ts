import type { MetadataRoute } from "next";

import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * robots.txt. Every deployment allows crawling; only production names the
 * sitemap.
 *
 * Previews stay out of search through the `noindex` that app/layout.tsx puts
 * on every page they serve. That only works if a crawler may read the page:
 * a preview that disallowed crawling here would hide its own `noindex`, and a
 * preview URL linked from elsewhere could then be listed anyway, from the link
 * alone. So nothing is disallowed, and indexing is decided per page.
 */
const robots = (): MetadataRoute.Robots =>
  isIndexable
    ? {
        // /cart/ makes a cart and redirects to checkout (app/cart/[lines]).
        rules: { userAgent: "*", allow: "/", disallow: "/cart/" },
        sitemap: absoluteUrl("/sitemap.xml"),
      }
    : { rules: { userAgent: "*", allow: "/" } };

export { robots as default };
