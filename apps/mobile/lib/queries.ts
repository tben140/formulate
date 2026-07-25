import {
  CollectionProductsQuery,
  ProductByHandleQuery,
  describeError,
} from "@formulate/shopify";
import { useQuery } from "@tanstack/react-query";

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

const unwrap = <T>(result: Awaited<ReturnType<typeof storefront.request<T, never>>>): T => {
  if (!result.ok) throw new Error(describeError(result.error));
  return result.data;
};

export const useCollection = (handle: string) =>
  useQuery({
    queryKey: ["collection", handle],
    queryFn: async () =>
      unwrap(await storefront.request(CollectionProductsQuery, { handle, first: 24 })),
  });

export const useProduct = (handle: string) =>
  useQuery({
    queryKey: ["product", handle],
    queryFn: async () =>
      unwrap(await storefront.request(ProductByHandleQuery, { handle })),
    enabled: handle.length > 0,
  });
