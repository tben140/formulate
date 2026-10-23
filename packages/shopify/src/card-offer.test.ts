import { describe, expect, it } from "vitest";

import { cardOffer } from "./card-offer";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const variant = (
  id: string,
  price: string,
  plans: string[][] = [],
  availableForSale = true,
) => ({
  id,
  availableForSale,
  price: gbp(price),
  sellingPlanAllocations: {
    nodes: plans.map((prices, index) => ({
      sellingPlan: { id: `plan-${index}` },
      priceAdjustments: prices.map((p) => ({ price: gbp(p) })),
    })),
  },
});

/** Recharge owns plan-0 and plan-1; anything else is orphaned. */
const owned = {
  sellingPlanGroups: {
    nodes: [
      { appName: "294517", sellingPlans: { nodes: [{ id: "plan-0" }, { id: "plan-1" }] } },
    ],
  },
};

describe("cardOffer", () => {
  it("states the first variant's subscription saving", () => {
    expect(
      cardOffer({ ...owned, variants: { nodes: [variant("a", "15.95", [["13.56"]])] } }),
    ).toEqual({
      subscribe: "Subscribe & save 15%",
      savingPercent: 15,
      quickAddVariantId: "a",
    });
  });

  it("makes no claim for an introductory price, or with no plan", () => {
    expect(
      cardOffer({ ...owned, variants: { nodes: [variant("a", "20.00", [["10.00", "18.00"]])] } })
        .subscribe,
    ).toBeNull();
    expect(
      cardOffer({ ...owned, variants: { nodes: [variant("a", "20.00")] } }).subscribe,
    ).toBeNull();
  });

  it("ignores a plan no app owns", () => {
    expect(
      cardOffer({
        sellingPlanGroups: {
          nodes: [{ appName: null, sellingPlans: { nodes: [{ id: "plan-0" }] } }],
        },
        variants: { nodes: [variant("a", "15.95", [["13.56"]])] },
      }).subscribe,
    ).toBeNull();
  });

  it("states the saving of the first variant in stock", () => {
    expect(
      cardOffer({
        ...owned,
        variants: {
          nodes: [variant("a", "20.00", [["19.00"]], false), variant("b", "20.00", [["17.00"]])],
        },
      }).subscribe,
    ).toBe("Subscribe & save 15%");
  });

  it("quick-adds only a single variant that's in stock", () => {
    expect(
      cardOffer({ ...owned, variants: { nodes: [variant("a", "1.00"), variant("b", "1.00")] } })
        .quickAddVariantId,
    ).toBeNull();
    expect(
      cardOffer({ ...owned, variants: { nodes: [variant("a", "1.00", [], false)] } })
        .quickAddVariantId,
    ).toBeNull();
    expect(cardOffer({})).toEqual({
      subscribe: null,
      savingPercent: null,
      quickAddVariantId: null,
    });
  });
});
