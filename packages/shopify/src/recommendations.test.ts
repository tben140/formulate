import { describe, expect, it } from "vitest";

import { selectCartSuggestions } from "./recommendations";

const product = (
  id: string,
  { available = true, variants = [{ id: `${id}-v1`, availableForSale: true }] } = {},
) => ({
  id,
  handle: id,
  title: id,
  availableForSale: available,
  featuredImage: null,
  priceRange: { minVariantPrice: { amount: "10.0", currencyCode: "GBP" as const } },
  variants: { nodes: variants },
});

describe("selectCartSuggestions", () => {
  it("never suggests what is already in the cart", () => {
    const picked = selectCartSuggestions(
      [product("a"), product("b"), product("c")],
      ["b"],
    );
    expect(picked.map((s) => s.product.id)).toEqual(["a", "c"]);
  });

  it("drops unavailable products rather than suggesting something that can't be bought", () => {
    const picked = selectCartSuggestions(
      [product("a", { available: false }), product("b")],
      [],
    );
    expect(picked.map((s) => s.product.id)).toEqual(["b"]);
  });

  it("caps at three, after filtering, keeping Shopify's order", () => {
    const picked = selectCartSuggestions(
      ["a", "b", "c", "d", "e"].map((id) => product(id)),
      ["a"],
    );
    expect(picked.map((s) => s.product.id)).toEqual(["b", "c", "d"]);
  });

  it("offers one-tap add only for a single in-stock variant", () => {
    const [single] = selectCartSuggestions([product("a")], []);
    expect(single).toEqual(expect.objectContaining({ kind: "add", variantId: "a-v1" }));
  });

  it("links to the product when there is a variant to choose", () => {
    const [multi] = selectCartSuggestions(
      [
        product("a", {
          variants: [
            { id: "a-v1", availableForSale: true },
            { id: "a-v2", availableForSale: true },
          ],
        }),
      ],
      [],
    );
    expect(multi?.kind).toBe("view");
  });

  it("returns nothing for no recommendations, so nothing renders", () => {
    expect(selectCartSuggestions(null, [])).toEqual([]);
    expect(selectCartSuggestions([product("a")], ["a"])).toEqual([]);
  });
});
