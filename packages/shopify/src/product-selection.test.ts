import { describe, expect, it } from "vitest";

import {
  defaultSelectedOptions,
  findVariantByOptions,
  hasOwningApp,
  purchasableAllocations,
  purchasableSellingPlanGroups,
  withOption,
} from "./product-selection";

/**
 * Real plan ids from `selling-plans-ski-wax`, read from the Storefront API on
 * 2026-08-06. The variant allocates exactly these three of the product's five
 * groups, and only the last one is managed by an app.
 */
const PREPAID_PLAN = "gid://shopify/SellingPlan/697692062008";
const WEEKLY_PLAN = "gid://shopify/SellingPlan/697692094776";
const RECHARGE_PLAN = "gid://shopify/SellingPlan/697746522424";

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
  const plans = (...ids: string[]) => ({ nodes: ids.map((id) => ({ id })) });

  const SEED_GROUPS = [
    { name: "Prepaid", appName: null, sellingPlans: plans(PREPAID_PLAN) },
    { name: "Subscription", appName: null, sellingPlans: plans(WEEKLY_PLAN) },
    { name: "Try Before You Buy", appName: null, sellingPlans: plans("gid://tbyb") },
    { name: "Preorder", appName: null, sellingPlans: plans("gid://preorder") },
  ];
  const RECHARGE_GROUP = {
    name: "Delivery every 30 days",
    appName: "294517",
    sellingPlans: plans(RECHARGE_PLAN),
  };

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
    expect(hasOwningApp({})).toBe(false);
  });

  it("rejects an empty-string appName", () => {
    expect(hasOwningApp({ appName: "" })).toBe(false);
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

describe("purchasableAllocations", () => {
  const plans = (...ids: string[]) => ({ nodes: ids.map((id) => ({ id })) });

  const GROUPS = [
    { name: "Prepaid", appName: null, sellingPlans: plans(PREPAID_PLAN) },
    { name: "Subscription", appName: null, sellingPlans: plans(WEEKLY_PLAN) },
    {
      name: "Delivery every 30 days",
      appName: "294517",
      sellingPlans: plans(RECHARGE_PLAN),
    },
  ];

  /** Exactly what the variant returns on the live store. */
  const ALLOCATIONS = [
    { sellingPlan: { id: PREPAID_PLAN } },
    { sellingPlan: { id: WEEKLY_PLAN } },
    { sellingPlan: { id: RECHARGE_PLAN } },
  ];

  it("keeps only the allocation whose group has an owning app", () => {
    // Three plausible-looking subscription options; one that will ever charge.
    expect(purchasableAllocations(GROUPS, ALLOCATIONS)).toEqual([
      { sellingPlan: { id: RECHARGE_PLAN } },
    ]);
  });

  it("returns nothing when no group is app-managed", () => {
    expect(purchasableAllocations(GROUPS.slice(0, 2), ALLOCATIONS)).toEqual([]);
  });

  it("ignores plans the variant does not allocate", () => {
    // A group can own plans this particular variant is not sold on.
    expect(
      purchasableAllocations(GROUPS, [{ sellingPlan: { id: PREPAID_PLAN } }]),
    ).toEqual([]);
  });

  it("returns an empty array for a variant with no allocations", () => {
    expect(purchasableAllocations(GROUPS, [])).toEqual([]);
  });
});
