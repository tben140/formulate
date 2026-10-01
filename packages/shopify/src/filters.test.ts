import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  isSelected,
  paramValue,
  productFiltersFromParams,
  withoutFilters,
  withPriceRange,
  withValueToggled,
  type FilterLike,
} from "./filters";

/** As the Storefront API returned them for `performance` on 2026-10-01. */
const availability: FilterLike = {
  id: "filter.v.availability",
  label: "Availability",
  type: "LIST",
  values: [
    {
      id: "filter.v.availability.1",
      label: "In stock",
      count: 6,
      input: '{"available":true}',
    },
    {
      id: "filter.v.availability.0",
      label: "Out of stock",
      count: 0,
      input: '{"available":false}',
    },
  ],
};

const price: FilterLike = {
  id: "filter.v.price",
  label: "Price",
  type: "PRICE_RANGE",
  values: [
    {
      id: "filter.v.price",
      label: "Price",
      count: 0,
      input: '{"price":{"min":0,"max":32.95}}',
    },
  ],
};

/** The shape an option filter takes once configured in Search & Discovery. */
const flavour: FilterLike = {
  id: "filter.v.option.flavour",
  label: "Flavour",
  type: "LIST",
  values: [
    {
      id: "filter.v.option.flavour.vanilla",
      label: "Vanilla",
      count: 2,
      input: '{"variantOption":{"name":"Flavour","value":"Vanilla"}}',
    },
    {
      id: "filter.v.option.flavour.chocolate",
      label: "Chocolate",
      count: 2,
      input: '{"variantOption":{"name":"Flavour","value":"Chocolate"}}',
    },
  ],
};

const available = [availability, price, flavour];
const q = (query: string) => new URLSearchParams(query);

describe("productFiltersFromParams", () => {
  it("reads Liquid-style parameters with no knowledge of the available filters", () => {
    expect(
      productFiltersFromParams(
        q(
          "filter.v.availability=1&filter.v.price.gte=10&filter.v.price.lte=30" +
            "&filter.v.option.flavour=Vanilla&filter.p.m.double_helix.format=Capsule" +
            "&filter.p.product_type=Supplement&filter.p.tag=bestseller",
        ),
      ),
    ).toEqual([
      { price: { min: 10, max: 30 } },
      { available: true },
      { variantOption: { name: "flavour", value: "Vanilla" } },
      {
        productMetafield: { namespace: "double_helix", key: "format", value: "Capsule" },
      },
      { productType: "Supplement" },
      { tag: "bestseller" },
    ]);
  });

  it("uses a known value's own input when the available filters are given", () => {
    // Exact option name ("Flavour"), whatever case the URL used.
    expect(
      productFiltersFromParams(q("filter.v.option.flavour=vanilla"), available),
    ).toEqual([{ variantOption: { name: "Flavour", value: "Vanilla" } }]);
  });

  it("sends one filter per selected value", () => {
    expect(
      productFiltersFromParams(
        q("filter.v.option.flavour=Vanilla&filter.v.option.flavour=Chocolate"),
        available,
      ),
    ).toHaveLength(2);
  });

  it("takes either end of a price range alone, and ignores nonsense", () => {
    expect(productFiltersFromParams(q("filter.v.price.lte=20"))).toEqual([
      { price: { max: 20 } },
    ]);
    expect(
      productFiltersFromParams(q("filter.v.price.gte=abc&filter.v.price.lte=-5")),
    ).toEqual([]);
  });

  it("ignores everything that isn't a filter it understands", () => {
    expect(
      productFiltersFromParams(
        q(
          "sort=price&page=2&filter.v.availability=maybe&filter.x.unknown=1&filter.v.option.=x",
        ),
      ),
    ).toEqual([]);
  });
});

describe("building the next query string", () => {
  it("maps a value to Liquid's parameter value", () => {
    expect(paramValue(availability, availability.values[0]!)).toBe("1");
  });

  it("toggles a value on and off, keeping other parameters and dropping the page", () => {
    const inStock = availability.values[0]!;
    const on = withValueToggled(q("sort=price&page=3"), availability, inStock);
    expect(on.toString()).toBe("sort=price&filter.v.availability=1");
    expect(isSelected(on, availability, inStock)).toBe(true);

    const off = withValueToggled(on, availability, inStock);
    expect(off.toString()).toBe("sort=price");
  });

  it("treats a differently-cased selection as the same value", () => {
    const vanilla = flavour.values[0]!;
    expect(isSelected(q("filter.v.option.flavour=VANILLA"), flavour, vanilla)).toBe(true);
    expect(
      withValueToggled(q("filter.v.option.flavour=VANILLA"), flavour, vanilla).toString(),
    ).toBe("");
  });

  it("sets and clears a price range", () => {
    expect(withPriceRange(q(""), price, 10, 25).toString()).toBe(
      "filter.v.price.gte=10&filter.v.price.lte=25",
    );
    expect(withPriceRange(q("filter.v.price.gte=10"), price, null, null).toString()).toBe(
      "",
    );
  });

  it("clears every filter but nothing else, and counts what's active", () => {
    const params = q("sort=price&filter.v.availability=1&filter.v.price.gte=5");
    expect(activeFilterCount(params)).toBe(2);
    expect(withoutFilters(params).toString()).toBe("sort=price");
  });
});
