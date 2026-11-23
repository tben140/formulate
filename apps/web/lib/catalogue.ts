import {
  collectionSort,
  CollectionProductsQuery,
  optionColours,
  productFiltersFromParams,
  ProductByHandleQuery,
  withOptionColours,
} from "@formulate/shopify";
import { cache } from "react";

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
export const getProduct = cache(async (handle: string) => {
  const result = await storefront.request(ProductByHandleQuery, { handle });
  if (!result.ok || !result.data.product) return result;
  // Flavours and other values Shopify gives no swatch take the shop's colours.
  const colours = optionColours(result.data.shop.optionColours?.value);
  return {
    ...result,
    data: { ...result.data, product: withOptionColours(result.data.product, colours) },
  };
});

/** How many products a collection page shows. Pagination is SHO-44. */
export const COLLECTION_PAGE_SIZE = 24;

/**
 * `listingQuery` is the Liquid-style filter and sort query string (SHO-153):
 * `filter.*` parameters and `sort_by`. A string, not the parsed values, so
 * React's per-render cache can match it.
 */
export const getCollection = cache(async (handle: string, listingQuery = "") => {
  const params = new URLSearchParams(listingQuery);
  const { sortKey, reverse } = collectionSort(params);
  return storefront.request(CollectionProductsQuery, {
    handle,
    first: COLLECTION_PAGE_SIZE,
    filters: productFiltersFromParams(params),
    sortKey,
    reverse,
  });
});
