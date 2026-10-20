import {
  CollectionProductsQuery,
  ComplementaryProductsQuery,
  ProductByHandleQuery,
  SearchProductsQuery,
  describeError,
  productFiltersFromParams,
} from "@formulate/shopify";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { storefront } from "./storefront";

/**
 * TanStack Query wrappers around the shared client.
 *
 * These live in the app rather than in @formulate/shopify on purpose: the web
 * app fetches in Server Components and has no use for a client-side cache, so
 * putting TanStack in the shared package would force a dependency on web that
 * it would never call. The *shared* part is the client, the query documents
 * and the generated types — which is the part that actually matters.
 *
 * `request()` returns a Result rather than throwing, so we convert a failed
 * Result into a thrown Error here — that is the contract TanStack Query needs
 * to drive its own `isError` state.
 */

const unwrap = <T>(
  result: Awaited<ReturnType<typeof storefront.request<T, never>>>,
): T => {
  if (!result.ok) throw new Error(describeError(result.error));
  return result.data;
};

/**
 * A collection's products, filtered by a Liquid-style filter query string
 * (`filter.v.option.flavour=Vanilla`), the same format web and the theme use.
 * The previous results stay on screen while a new filter loads, rather than
 * the list flashing to a spinner on every change.
 */
export const useCollection = (handle: string, filterQuery = "") =>
  useQuery({
    queryKey: ["collection", handle, filterQuery],
    queryFn: async () =>
      unwrap(
        await storefront.request(CollectionProductsQuery, {
          handle,
          first: 24,
          filters: productFiltersFromParams(new URLSearchParams(filterQuery)),
        }),
      ),
    placeholderData: keepPreviousData,
  });

export const useProduct = (handle: string) =>
  useQuery({
    queryKey: ["product", handle],
    queryFn: async () =>
      unwrap(await storefront.request(ProductByHandleQuery, { handle })),
    enabled: handle.length > 0,
  });

/**
 * "Pairs well with": the complementary products set in Search & Discovery.
 * Slow to change, so cached for ten minutes.
 */
export const useComplementaryProducts = (productId: string | undefined) =>
  useQuery({
    queryKey: ["complementary", productId],
    queryFn: async () =>
      unwrap(
        await storefront.request(ComplementaryProductsQuery, {
          productId: productId ?? "",
        }),
      ).productRecommendations ?? [],
    enabled: Boolean(productId),
    staleTime: 10 * 60_000,
  });

/**
 * Product search, as Search & Discovery tunes it, with the same filter query
 * string as collections. Off until the term is at least two characters, and
 * previous results stay on screen while the next ones load.
 */
export const useSearch = (term: string, filterQuery = "") =>
  useQuery({
    queryKey: ["search", term, filterQuery],
    queryFn: async () =>
      unwrap(
        await storefront.request(SearchProductsQuery, {
          query: term,
          first: 24,
          filters: productFiltersFromParams(new URLSearchParams(filterQuery)),
        }),
      ).search,
    enabled: term.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
