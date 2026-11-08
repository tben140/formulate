/**
 * Cache tag names (SHO-171), shared by the cached loaders (lib/catalogue.ts)
 * and the Shopify Events route that clears them, so both spell them the same.
 */
export const TAGS = {
  product: (handle: string) => `product:${handle}`,
  collection: (handle: string) => `collection:${handle}`,
  collections: "collections",
  sitemap: "sitemap",
} as const;
