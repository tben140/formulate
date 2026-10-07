import {
  describeError,
  PREDICTIVE_SEARCH,
  PredictiveSearchQuery,
  suggestionTerm,
  toProductSuggestions,
} from "@formulate/shopify";
import { NextResponse, type NextRequest } from "next/server";

import { storefront } from "@/lib/storefront";

/**
 * Search suggestions for the search box (SHO-103), as JSON.
 *
 * A Route Handler so the Storefront token stays on the server, the same as
 * every other Storefront call in this app. Suggestions are the same for every
 * shopper, so the CDN may cache them for a minute: someone typing "mag" right
 * after someone else gets the answer without a Shopify round trip.
 */
const suggest = async (request: NextRequest) => {
  const term = suggestionTerm(request.nextUrl.searchParams.get("q") ?? "");
  if (!term) return NextResponse.json({ products: [] });

  const result = await storefront.request(PredictiveSearchQuery, {
    query: term,
    limit: PREDICTIVE_SEARCH.limit,
  });
  if (!result.ok) {
    console.error(describeError(result.error));
    // The box falls back to "press Enter to search", which still works.
    return NextResponse.json({ products: [] }, { status: 502 });
  }

  return NextResponse.json(
    { products: toProductSuggestions(result.data.predictiveSearch?.products) },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
};

export { suggest as GET };
