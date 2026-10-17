import { describe, expect, test } from "vitest";

import {
  describeFrequency,
  describeSubscription,
  plansById,
  readPlan,
} from "./subscription-plan";

const recharge = (
  frequency: string,
  adjustments = [{ orderCount: null, percent: 15 }],
) => ({
  options: [
    { name: "Recharge Plan ID", value: "23481161" },
    { name: "Order Frequency and Unit", value: frequency },
    { name: "Product Quantity", value: "0" },
  ],
  priceAdjustments: adjustments.map(({ orderCount, percent }) => ({
    orderCount,
    adjustmentValue: {
      __typename: "SellingPlanPercentagePriceAdjustment",
      adjustmentPercentage: percent,
    },
  })),
});

describe("describeFrequency", () => {
  test.each([
    ["30-day", "every 30 days"],
    ["1-month", "every month"],
    ["4 weeks", "every 4 weeks"],
    ["2-Week", "every 2 weeks"],
    ["0-day", null],
    ["fortnightly", null],
  ])("%s → %s", (value, expected) => expect(describeFrequency(value)).toBe(expected));
});

describe("readPlan", () => {
  test("our Recharge plans: frequency and the discount on every delivery", () => {
    expect(readPlan(recharge("30-day"))).toEqual({
      every: "every 30 days",
      percentOff: 15,
    });
  });

  test("a first-order-only discount is not 'off each delivery'", () => {
    expect(readPlan(recharge("60-day", [{ orderCount: 1, percent: 20 }]))).toEqual({
      every: "every 60 days",
      percentOff: null,
    });
  });

  test("a plan without a frequency option says nothing about frequency", () => {
    expect(readPlan({ options: [], priceAdjustments: [] })).toEqual({
      every: null,
      percentOff: null,
    });
  });
});

describe("plansById", () => {
  test("collects every plan from every variant, and survives nulls", () => {
    const plans = plansById({
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          sellingPlanAllocations: {
            nodes: [
              {
                sellingPlan: {
                  id: "gid://shopify/SellingPlan/30",
                  ...recharge("30-day"),
                },
              },
            ],
          },
        },
        null,
      ],
    });
    expect(plans.get("gid://shopify/SellingPlan/30")).toEqual({
      every: "every 30 days",
      percentOff: 15,
    });
  });
});

describe("describeSubscription", () => {
  test("full facts", () => {
    expect(
      describeSubscription("Magnesium Glycinate", {
        every: "every 30 days",
        percentOff: 15,
      }),
    ).toBe("Magnesium Glycinate, delivered every 30 days with 15% off each delivery.");
  });

  test("unknown plan still says it repeats", () => {
    expect(describeSubscription("Vitamin D3", undefined)).toBe(
      "Vitamin D3, delivered on repeat.",
    );
  });
});
