import { SitemapCollectionsQuery, SitemapProductsQuery } from "@formulate/shopify";
import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/site";
import { storefront } from "@/lib/storefront";

/**
 * Rebuilt at most hourly. A sitemap Next builds once at deploy time would miss
 * every product added afterwards; one rebuilt per request would query Shopify
 * for every crawler hit. An hour is well inside how often search engines read
 * it.
 */
export const revalidate = 3600;

/**
 * Walks a Storefront connection to the end. 250 is the API's page maximum.
 * A failed page ends the walk with what was gathered so far: a partial sitemap
 * is better than none, and the next rebuild tries again.
 */
const collectAll = async <T>(
  fetchPage: (after: string | null) => Promise<{
    nodes: readonly T[];
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
  } | null>,
): Promise<T[]> => {
  const all: T[] = [];
  let after: string | null = null;

  for (;;) {
    const page = await fetchPage(after);
    if (!page) return all;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage || !page.pageInfo.endCursor) return all;
    after = page.pageInfo.endCursor;
  }
};

/**
 * Every product and every non-empty collection the Headless channel can see,
 * which is exactly what this app can render. The theme's sitemap is Shopify's
 * own, at the store domain.
 */
const sitemap = async (): Promise<MetadataRoute.Sitemap> => {
  const [products, collections] = await Promise.all([
    collectAll(async (after) => {
      const result = await storefront.request(SitemapProductsQuery, { after });
      return result.ok ? result.data.products : null;
    }),
    collectAll(async (after) => {
      const result = await storefront.request(SitemapCollectionsQuery, { after });
      return result.ok ? result.data.collections : null;
    }),
  ]);

  return [
    ...collections
      // An empty collection renders an empty page; listing it only wastes a
      // crawler's time on the site.
      .filter((collection) => collection.products.nodes.length > 0)
      .map((collection) => ({
        url: absoluteUrl(`/collections/${collection.handle}`),
        lastModified: collection.updatedAt,
      })),
    ...products.map((product) => ({
      url: absoluteUrl(`/products/${product.handle}`),
      lastModified: product.updatedAt,
    })),
  ];
};

export { sitemap as default };
