import { describe, expect, it } from "vitest";

import { upgradeOffer, upgradeTerms } from "./subscribe-upgrade";

const plan = (id: string, every: string, percent: number | null) => ({
  id,
  options: [{ name: "Order Frequency and Unit", value: every }],
  priceAdjustments: percent
    ? [
        {
          orderCount: null,
          adjustmentValue: {
            __typename: "SellingPlanPercentagePriceAdjustment",
            adjustmentPercentage: percent,
          },
        },
      ]
    : [],
});
const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const variant = (
  allocations: { plan: ReturnType<typeof plan>; prices: string[] }[],
  owned: string[] = allocations.map((a) => a.plan.id),
) => ({
  id: "v",
  product: {
    sellingPlanGroups: {
      nodes: [
        { appName: "ReCharge", sellingPlans: { nodes: owned.map((id) => ({ id })) } },
        { appName: null, sellingPlans: { nodes: [{ id: "seed" }] } },
      ],
    },
  },
  sellingPlanAllocations: {
    nodes: allocations.map(({ plan: sellingPlan, prices }) => ({
      sellingPlan,
      priceAdjustments: prices.map((p) => ({ price: gbp(p) })),
    })),
  },
});

describe("upgradeOffer", () => {
  it("offers the 30-day plan with its saving and price", () => {
    const offer = upgradeOffer(
      variant([
        { plan: plan("p60", "60-day", 15), prices: ["13.56"] },
        { plan: plan("p30", "30-day", 15), prices: ["13.56"] },
      ]),
    );
    expect(offer).toEqual({
      sellingPlanId: "p30",
      every: "every 30 days",
      percentOff: 15,
      price: gbp("13.56"),
    });
    expect(upgradeTerms(offer!, "£13.56")).toBe(
      "Renews automatically every 30 days at £13.56 a delivery until you cancel. You can skip, pause or cancel any time.",
    );
  });

  it("skips plans no app manages, introductory prices and plans without a saving", () => {
    expect(upgradeOffer(variant([{ plan: plan("p30", "30-day", 15), prices: ["13.56"] }], []))).toBeNull();
    expect(
      upgradeOffer(variant([{ plan: plan("p30", "30-day", 15), prices: ["10.00", "13.56"] }])),
    ).toBeNull();
    expect(upgradeOffer(variant([{ plan: plan("p30", "30-day", null), prices: ["15.95"] }]))).toBeNull();
    expect(upgradeOffer(null)).toBeNull();
  });
});
