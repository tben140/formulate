import {
  CollectionProductsQuery,
  productFiltersFromParams,
  ProductByHandleQuery,
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
export const getProduct = cache(async (handle: string) =>
  storefront.request(ProductByHandleQuery, { handle }),
);

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
