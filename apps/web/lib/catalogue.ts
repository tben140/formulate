import {
  CollectionCardsQuery,
  CollectionProductsQuery,
  productFiltersFromParams,
  ProductByHandleQuery,
} from "@formulate/shopify";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import { TAGS } from "./cache-tags";
import { storefront } from "./storefront";

/**
 * Per-request memoised loaders.
 *
 * A route's `generateMetadata` and its page both need the same product. The
 * Storefront client POSTs, and Next only dedupes GET fetches, so without this
 * every product page would query Shopify twice for identical data. `cache`
 * scopes the memo to one server request, so nothing is shared between
 * shoppers.
 */
/*
 * Cached Shopify reads (SHO-171). Each is tagged, and a Shopify Event clears
 * the tag when something it shows changes (app/api/shopify-events). The hourly
 * lifetime is the backstop, because Shopify doesn't guarantee delivery.
 *
 * A failure is returned like any result but cached for a minute only, so an
 * outage is never remembered for hours. (Throwing out of a "use cache"
 * function fails prerendering, even when the caller catches it.)
 */

export const getProduct = async (handle: string) => {
  "use cache";
  cacheTag(TAGS.product(handle));
  const result = await storefront.request(ProductByHandleQuery, { handle });
  cacheLife(result.ok ? "hours" : "minutes");
  return result;
};

/** The home page's category cards. */
export const getCollectionCards = async () => {
  "use cache";
  cacheTag(TAGS.collections);
  const result = await storefront.request(CollectionCardsQuery, {});
  cacheLife(result.ok ? "hours" : "minutes");
  return result;
};

/** The first few products of a collection, as the home page features them. */
export const getFeaturedProducts = async (handle: string, first: number) => {
  "use cache";
  cacheTag(TAGS.collection(handle), TAGS.collections);
  const result = await storefront.request(CollectionProductsQuery, { handle, first });
  cacheLife(result.ok ? "hours" : "minutes");
  return result;
};

/** How many products a collection page shows. Pagination is SHO-44. */
export const COLLECTION_PAGE_SIZE = 24;

/**
 * `filterQuery` is the Liquid-style filter query string (SHO-153). A string,
 * not the parsed filters, so React's per-render cache can match it.
 */
export const getCollection = cache(async (handle: string, filterQuery = "") =>
  storefront.request(CollectionProductsQuery, {
    handle,
    first: COLLECTION_PAGE_SIZE,
    filters: productFiltersFromParams(new URLSearchParams(filterQuery)),
  }),
);
