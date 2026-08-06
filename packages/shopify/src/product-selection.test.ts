import { describe, expect, it } from "vitest";

import {
  defaultSelectedOptions,
  findVariantByOptions,
  hasOwningApp,
  purchasableSellingPlanGroups,
  withOption,
} from "./product-selection";

/**
 * These are the rules every surface applies, so a bug here is a bug in three
 * places at once. That is why this file exists before any UI does.
 */

const variant = (options: readonly [string, string][], availableForSale = true) => ({
  selectedOptions: options.map(([name, value]) => ({ name, value })),
  availableForSale,
});

const SMALL_BLUE = variant([
  ["Size", "S"],
  ["Colour", "Blue"],
]);
const LARGE_BLUE = variant([
  ["Size", "L"],
  ["Colour", "Blue"],
]);
const LARGE_RED = variant(
  [
    ["Size", "L"],
    ["Colour", "Red"],
  ],
  false,
);

const VARIANTS = [SMALL_BLUE, LARGE_BLUE, LARGE_RED];

describe("findVariantByOptions", () => {
  it("matches regardless of the order the options are given in", () => {
    expect(
      findVariantByOptions(VARIANTS, [
        { name: "Colour", value: "Blue" },
        { name: "Size", value: "L" },
      ]),
    ).toBe(LARGE_BLUE);
  });

  it("returns undefined for a partial selection rather than guessing", () => {
    // A half-filled picker must disable add-to-cart, not silently pick one of
    // the two blue variants for the shopper.
    expect(
      findVariantByOptions(VARIANTS, [{ name: "Colour", value: "Blue" }]),
    ).toBeUndefined();
  });

  it("returns undefined for a combination that does not exist", () => {
    expect(
      findVariantByOptions(VARIANTS, [
        { name: "Size", value: "S" },
        { name: "Colour", value: "Red" },
      ]),
    ).toBeUndefined();
  });

  it("does not match a superset of the variant's own options", () => {
    expect(
      findVariantByOptions(VARIANTS, [
        { name: "Size", value: "L" },
        { name: "Colour", value: "Blue" },
        { name: "Finish", value: "Matte" },
      ]),
    ).toBeUndefined();
  });

  it("finds a sold-out variant, leaving availability to the caller", () => {
    // Selecting a sold-out combination is a legitimate thing for a shopper to
    // do — the page must show it as sold out, which it cannot do if the
    // variant is unfindable.
    expect(
      findVariantByOptions(VARIANTS, [
        { name: "Size", value: "L" },
        { name: "Colour", value: "Red" },
      ]),
    ).toBe(LARGE_RED);
  });
});

describe("defaultSelectedOptions", () => {
  it("prefers the first purchasable variant", () => {
    expect(defaultSelectedOptions([LARGE_RED, SMALL_BLUE])).toEqual(
      SMALL_BLUE.selectedOptions,
    );
  });

  it("falls back to the first variant when everything is sold out", () => {
    // Rendering no selection would leave the page with no price at all, which
    // is worse than showing a sold-out one.
    const soldOut = variant([["Size", "S"]], false);
    expect(defaultSelectedOptions([soldOut])).toEqual(soldOut.selectedOptions);
  });

  it("returns an empty selection for a product with no variants", () => {
    expect(defaultSelectedOptions([])).toEqual([]);
  });
});

describe("withOption", () => {
  it("replaces one axis and leaves the others alone", () => {
    expect(
      withOption(
        [
          { name: "Size", value: "S" },
          { name: "Colour", value: "Blue" },
        ],
        "Size",
        "L",
      ),
    ).toEqual([
      { name: "Size", value: "L" },
      { name: "Colour", value: "Blue" },
    ]);
  });

  it("preserves option order when replacing", () => {
    const result = withOption(
      [
        { name: "Size", value: "S" },
        { name: "Colour", value: "Blue" },
      ],
      "Size",
      "L",
    );
    expect(result.map((o) => o.name)).toEqual(["Size", "Colour"]);
  });

  it("appends an axis that was not selected yet", () => {
    expect(withOption([{ name: "Size", value: "S" }], "Colour", "Red")).toEqual([
      { name: "Size", value: "S" },
      { name: "Colour", value: "Red" },
    ]);
  });

  it("does not mutate the input", () => {
    const selected = [{ name: "Size", value: "S" }];
    withOption(selected, "Size", "L");
    expect(selected).toEqual([{ name: "Size", value: "S" }]);
  });
});

describe("hasOwningApp", () => {
  /**
   * The shapes below are the real ones from `selling-plans-ski-wax` on the demo
   * store, read from the Storefront API on 2026-08-06.
   */
  const SEED_GROUPS = [
    { name: "Prepaid", appName: null },
    { name: "Subscription", appName: null },
    { name: "Try Before You Buy", appName: null },
    { name: "Preorder", appName: null },
  ];
  const RECHARGE_GROUP = { name: "Delivery every 30 days", appName: "294517" };

  it("rejects Shopify's unmanaged seed groups", () => {
    // These look entirely legitimate — real names, real plans, real price
    // adjustments — and cartLinesAdd accepts them. Nothing ever charges again.
    for (const group of SEED_GROUPS) {
      expect(hasOwningApp(group)).toBe(false);
    }
  });

  it("accepts a group owned by an installed app", () => {
    expect(hasOwningApp(RECHARGE_GROUP)).toBe(true);
  });

  it("treats a missing appName the same as a null one", () => {
    expect(hasOwningApp({ name: "No field at all" })).toBe(false);
  });

  it("rejects an empty-string appName", () => {
    expect(hasOwningApp({ name: "Empty", appName: "" })).toBe(false);
  });

  it("keeps only the Recharge group out of the real five", () => {
    expect(purchasableSellingPlanGroups([...SEED_GROUPS, RECHARGE_GROUP])).toEqual([
      RECHARGE_GROUP,
    ]);
  });

  it("returns an empty array when nothing is app-managed", () => {
    // Callers must read this as "one-time purchase only", not as an error.
    expect(purchasableSellingPlanGroups(SEED_GROUPS)).toEqual([]);
  });
});
