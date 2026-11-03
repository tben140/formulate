import { describe, expect, it } from "vitest";

import {
  PREDICTIVE_SEARCH,
  suggestionsStatus,
  suggestionTerm,
  toProductSuggestions,
} from "./predictive-search";

describe("suggestionTerm", () => {
  it("waits for two characters, ignoring surrounding spaces", () => {
    expect(suggestionTerm("m")).toBeNull();
    expect(suggestionTerm("  m ")).toBeNull();
    expect(suggestionTerm(" ma ")).toBe("ma");
  });
});

describe("toProductSuggestions", () => {
  const product = (n: number) => ({
    handle: `product-${n}`,
    title: `Product ${n}`,
    featuredImage: { url: `https://cdn.shopify.com/p${n}.png` },
    priceRange: { minVariantPrice: { amount: "17.95", currencyCode: "GBP" } },
  });

  it("keeps what a suggestion shows, capped at the shared limit", () => {
    const suggestions = toProductSuggestions(
      Array.from({ length: 9 }, (_, i) => product(i)),
    );
    expect(suggestions).toHaveLength(PREDICTIVE_SEARCH.limit);
    expect(suggestions[0]).toEqual({
      handle: "product-0",
      title: "Product 0",
      price: { amount: "17.95", currencyCode: "GBP" },
      imageUrl: "https://cdn.shopify.com/p0.png",
    });
  });

  it("copes with a product that has no image or price", () => {
    expect(toProductSuggestions([{ handle: "x", title: "X" }])).toEqual([
      { handle: "x", title: "X", price: null, imageUrl: null },
    ]);
    expect(toProductSuggestions(null)).toEqual([]);
  });
});

describe("suggestionsStatus", () => {
  it("says how many there are and how to reach them", () => {
    expect(suggestionsStatus(0)).toBe("No suggestions. Press Enter to search.");
    expect(suggestionsStatus(1)).toMatch(/^1 suggestion\./);
    expect(suggestionsStatus(6)).toMatch(/^6 suggestions\./);
  });
});
