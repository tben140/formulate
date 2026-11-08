import { describe, expect, it } from "vitest";

import type { FilterLike } from "./filters";
import { collectionSort, filterGroups, priceRangeLabel, withSort } from "./listing";

const list = (id: string, values: [string, number][]): FilterLike => ({
  id,
  label: id,
  type: "LIST",
  values: values.map(([label, count]) => ({
    id: `${id}.${label.toLowerCase()}`,
    label,
    count,
    input: JSON.stringify({ variantOption: { name: id, value: label } }),
  })),
});

const price = (min: number, max: number): FilterLike => ({
  id: "filter.v.price",
  label: "Price",
  type: "PRICE_RANGE",
  values: [
    {
      id: "filter.v.price",
      label: "Price",
      count: 0,
      input: JSON.stringify({ price: { min, max } }),
    },
  ],
});

describe("collectionSort and withSort", () => {
  it("defaults to the merchant's order, and ignores an unknown sort", () => {
    expect(collectionSort(new URLSearchParams()).sortKey).toBe("COLLECTION_DEFAULT");
    expect(collectionSort(new URLSearchParams("sort_by=nonsense")).sortKey).toBe(
      "COLLECTION_DEFAULT",
    );
  });

  it("reads Liquid's sort values", () => {
    expect(collectionSort(new URLSearchParams("sort_by=price-descending"))).toMatchObject(
      {
        sortKey: "PRICE",
        reverse: true,
      },
    );
  });

  it("sets a sort, keeps the filters, and leaves no parameter for the default", () => {
    const params = new URLSearchParams("filter.v.availability=1&page=2");
    expect(withSort(params, "created-descending").toString()).toBe(
      "filter.v.availability=1&sort_by=created-descending",
    );
    expect(withSort(new URLSearchParams("sort_by=price-ascending"), "").toString()).toBe(
      "",
    );
  });
});

describe("filterGroups", () => {
  it("leaves out values that would change nothing, and empty groups", () => {
    const groups = filterGroups(
      [
        list("filter.v.availability", [
          ["In stock", 6],
          ["Out of stock", 0],
        ]),
        list("filter.v.option.flavour", [
          ["Berry", 2],
          ["Vanilla", 6],
        ]),
      ],
      new URLSearchParams(),
      6,
    );
    expect(groups.map((group) => group.filter.id)).toEqual(["filter.v.option.flavour"]);
    expect(groups[0]?.values.map((value) => value.label)).toEqual(["Berry"]);
  });

  it("keeps a selected value even when it matches everything", () => {
    const groups = filterGroups(
      [list("filter.v.availability", [["In stock", 6]])],
      new URLSearchParams("filter.v.availability=In stock"),
      6,
    );
    expect(groups[0]?.values).toHaveLength(1);
    expect(groups[0]?.selected).toBe(1);
  });

  it("keeps values matching every listed product when the total isn't known", () => {
    expect(
      filterGroups(
        [list("filter.v.availability", [["In stock", 24]])],
        new URLSearchParams(),
        null,
      ),
    ).toHaveLength(1);
  });

  it("opens the first three groups, and any with a selection", () => {
    const filters = ["a", "b", "c", "d", "e"].map((id) => list(id, [["X", 1]]));
    const groups = filterGroups(filters, new URLSearchParams("e=X"), 6);
    expect(groups.map((group) => group.open)).toEqual([true, true, true, false, true]);
  });

  it("opens Show more when a selection is past the first five", () => {
    const values: [string, number][] = ["A", "B", "C", "D", "E", "F"].map((v) => [v, 1]);
    expect(filterGroups([list("k", values)], new URLSearchParams(), 6)[0]?.moreOpen).toBe(
      false,
    );
    expect(
      filterGroups([list("k", values)], new URLSearchParams("k=F"), 6)[0]?.moreOpen,
    ).toBe(true);
  });

  it("drops a price range with one price, unless it's set", () => {
    expect(filterGroups([price(10, 10)], new URLSearchParams(), 2)).toHaveLength(0);
    expect(filterGroups([price(0, 32.95)], new URLSearchParams(), 2)).toHaveLength(1);
    expect(
      filterGroups([price(10, 10)], new URLSearchParams("filter.v.price.lte=10"), 2),
    ).toHaveLength(1);
  });
});

describe("priceRangeLabel", () => {
  it("rounds out to whole pounds", () => {
    expect(priceRangeLabel(price(0, 32.95))).toBe("£0 – £33");
  });
});

describe("filterGroups and availability", () => {
  const availability: FilterLike = {
    id: "filter.v.availability",
    label: "Availability",
    type: "LIST",
    values: [
      { id: "a.1", label: "In stock", count: 22, input: '{"available":true}' },
      { id: "a.0", label: "Out of stock", count: 1, input: '{"available":false}' },
    ],
  };

  it("never offers Out of stock, so a fully stocked listing has no group", () => {
    expect(filterGroups([availability], new URLSearchParams(), 22)).toHaveLength(0);
    expect(
      filterGroups([availability], new URLSearchParams(), 30)[0]?.values,
    ).toHaveLength(1);
  });

  it("keeps Out of stock when a link already selects it", () => {
    expect(
      filterGroups([availability], new URLSearchParams("filter.v.availability=0"), 22)[0]
        ?.values,
    ).toHaveLength(1);
  });
});
