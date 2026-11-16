import type { MetadataRoute } from "next";

import { absoluteUrl, isIndexable } from "@/lib/site";

/**
 * robots.txt. Production allows everything and names the sitemap; every other
 * deployment disallows everything.
 *
 * This and the per-page `robots` metadata in app/layout.tsx are two halves of
 * one rule, and neither is enough alone. robots.txt stops a crawl, but a URL
 * linked from elsewhere can still be listed without being crawled; `noindex`
 * removes it, but only works if the page is crawled. So a preview disallows
 * the crawl here and says `noindex` on every page it does serve.
 */
const robots = (): MetadataRoute.Robots =>
  isIndexable
    ? {
        rules: { userAgent: "*", allow: "/" },
        sitemap: absoluteUrl("/sitemap.xml"),
      }
    : { rules: { userAgent: "*", disallow: "/" } };

export { robots as default };
