import {
  productFiltersFromParams,
  SearchProductsQuery,
  withoutEmptyFilters,
} from "@formulate/shopify";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CollectionFilters } from "@/components/collection-filters";
import { ProductCard } from "@/components/product-card";
import { StorefrontErrorState } from "@/components/storefront-error";
import { toSearchParams } from "@/lib/search-params";
import { storefront } from "@/lib/storefront";

/**
 * Results pages are endless near-duplicates of the catalogue, so search
 * engines are asked not to index them (they may still follow the links).
 */
export const metadata: Metadata = {
  title: "Search — Formulate",
  robots: { index: false, follow: true },
};

interface PageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Product search (SHO-153), tuned by Search & Discovery: its synonyms and
 * boosts apply with no code here. Results take the same filters as a
 * collection, through the same panel and URL format.
 *
 * A plain GET form, so it works before hydration, and every search is a
 * shareable `/search?q=...` URL. The theme's /search page takes the same URL.
 */
const SearchPage = async ({ searchParams }: PageProps) => {
  const query = toSearchParams(await searchParams);

  const tidy = withoutEmptyFilters(query);
  if (tidy) redirect(tidy.size ? `/search?${tidy}` : "/search");

  const term = (query.get("q") ?? "").trim();
  const result = term
    ? await storefront.request(SearchProductsQuery, {
        query: term,
        first: 24,
        filters: productFiltersFromParams(query),
      })
    : null;

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Search</h1>

      <form
        method="get"
        action="/search"
        role="search"
        className="mt-6 flex max-w-xl gap-2"
      >
        <label htmlFor="search-term" className="sr-only">
          Search products
        </label>
        <input
          id="search-term"
          type="search"
          name="q"
          defaultValue={term}
          placeholder="Search products"
          autoComplete="off"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-md border border-ink-400 px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 font-semibold text-surface hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {result && !result.ok ? <StorefrontErrorState error={result.error} /> : null}

      {result?.ok ? (
        <section aria-labelledby="search-results" className="mt-8">
          <h2 id="search-results" className="sr-only">
            Results
          </h2>
          {/* The filter panel only appears when there are results to filter. */}
          {result.data.search.totalCount > 0 || query.toString().includes("filter.") ? (
            <CollectionFilters
              filters={result.data.search.productFilters}
              params={query}
              path="/search"
              productCount={result.data.search.nodes.length}
            />
          ) : null}

          {result.data.search.nodes.length === 0 ? (
            <p className="py-12 text-center text-foreground-muted">
              No products match “{term}”. Try a different word, or browse the collections.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {result.data.search.nodes.map((product, index) =>
                product.__typename === "Product" ? (
                  <li key={product.id}>
                    <ProductCard
                      product={product}
                      sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
                      // The first result's image is the LCP; lazy, it waited
                      // ~1.3 s to start on a phone (SHO-148, as SHO-143 found
                      // on collections). Only the first: see the collection page.
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
};

export { SearchPage as default };
