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
 * A failure is thrown out of the cache, so it's never cached, and the caller
 * retries uncached so the page can still render its error.
 */

const fetchProductCached = async (handle: string) => {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.product(handle));
  const result = await storefront.request(ProductByHandleQuery, { handle });
  if (!result.ok) throw new Error(`product ${handle} unavailable`);
  return result.data;
};

export const getProduct = async (handle: string) => {
  try {
    return { ok: true as const, data: await fetchProductCached(handle) };
  } catch {
    return storefront.request(ProductByHandleQuery, { handle });
  }
};

const fetchCollectionCardsCached = async () => {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.collections);
  const result = await storefront.request(CollectionCardsQuery, {});
  if (!result.ok) throw new Error("collection cards unavailable");
  return result.data;
};

/** The home page's category cards. */
export const getCollectionCards = async () => {
  try {
    return { ok: true as const, data: await fetchCollectionCardsCached() };
  } catch {
    return storefront.request(CollectionCardsQuery, {});
  }
};

const fetchFeaturedCached = async (handle: string, first: number) => {
  "use cache";
  cacheLife("hours");
  cacheTag(TAGS.collection(handle), TAGS.collections);
  const result = await storefront.request(CollectionProductsQuery, { handle, first });
  if (!result.ok) throw new Error(`collection ${handle} unavailable`);
  return result.data;
};

/** The first few products of a collection, as the home page features them. */
export const getFeaturedProducts = async (handle: string, first: number) => {
  try {
    return { ok: true as const, data: await fetchFeaturedCached(handle, first) };
  } catch {
    return storefront.request(CollectionProductsQuery, { handle, first });
  }
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
