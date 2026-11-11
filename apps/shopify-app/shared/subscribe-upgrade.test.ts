import { describe, expect, it } from "vitest";

import {
  appliedOffer,
  switchResult,
  unpricedTerms,
  upgradeOffer,
  upgradeTerms,
} from "./subscribe-upgrade";

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
    expect(
      upgradeOffer(variant([{ plan: plan("p30", "30-day", 15), prices: ["13.56"] }], [])),
    ).toBeNull();
    expect(
      upgradeOffer(
        variant([{ plan: plan("p30", "30-day", 15), prices: ["10.00", "13.56"] }]),
      ),
    ).toBeNull();
    expect(
      upgradeOffer(variant([{ plan: plan("p30", "30-day", null), prices: ["15.95"] }])),
    ).toBeNull();
    expect(upgradeOffer(null)).toBeNull();
  });
});

describe("after the switch", () => {
  const shown = upgradeOffer(
    variant([{ plan: plan("p30", "30-day", 15), prices: ["13.56"] }]),
  )!;

  it("is the same when the plan hasn't changed", () => {
    const now = variant([{ plan: plan("p30", "30-day", 15), prices: ["13.56"] }]);
    expect(switchResult(shown, appliedOffer(now, "p30"))).toEqual({
      kind: "same",
      offer: shown,
    });
  });

  it("states the new terms when the saving changed while checkout was open", () => {
    const now = variant([{ plan: plan("p30", "30-day", 12), prices: ["14.04"] }]);
    expect(switchResult(shown, appliedOffer(now, "p30"))).toEqual({
      kind: "changed",
      offer: {
        sellingPlanId: "p30",
        every: "every 30 days",
        percentOff: 12,
        price: gbp("14.04"),
      },
    });
  });

  it("counts a new price at the same saving as a change", () => {
    const now = variant([{ plan: plan("p30", "30-day", 15), prices: ["14.45"] }]);
    expect(switchResult(shown, appliedOffer(now, "p30")).kind).toBe("changed");
  });

  it("claims no price or saving when the plan can't be read again", () => {
    expect(switchResult(shown, null)).toEqual({ kind: "unknown" });
    // No flat saving any more, or no app manages it: nothing to claim.
    const noSaving = variant([{ plan: plan("p30", "30-day", null), prices: ["15.95"] }]);
    expect(switchResult(shown, appliedOffer(noSaving, "p30"))).toEqual({
      kind: "unknown",
    });
    const unowned = variant([{ plan: plan("p30", "30-day", 15), prices: ["13.56"] }], []);
    expect(appliedOffer(unowned, "p30")).toBeNull();
    expect(unpricedTerms("every 30 days")).toBe(
      "Renews automatically every 30 days until you cancel. You can skip, pause or cancel any time.",
    );
  });
});
