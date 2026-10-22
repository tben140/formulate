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
    nodes: plans.map((prices) => ({
      priceAdjustments: prices.map((p) => ({ price: gbp(p) })),
    })),
  },
});

describe("cardOffer", () => {
  it("states the first variant's subscription saving", () => {
    expect(
      cardOffer({ variants: { nodes: [variant("a", "15.95", [["13.56"]])] } }),
    ).toEqual({
      subscribe: "Subscribe & save 15%",
      savingPercent: 15,
      quickAddVariantId: "a",
    });
  });

  it("makes no claim for an introductory price, or with no plan", () => {
    expect(
      cardOffer({ variants: { nodes: [variant("a", "20.00", [["10.00", "18.00"]])] } })
        .subscribe,
    ).toBeNull();
    expect(
      cardOffer({ variants: { nodes: [variant("a", "20.00")] } }).subscribe,
    ).toBeNull();
  });

  it("quick-adds only a single variant that's in stock", () => {
    expect(
      cardOffer({ variants: { nodes: [variant("a", "1.00"), variant("b", "1.00")] } })
        .quickAddVariantId,
    ).toBeNull();
    expect(
      cardOffer({ variants: { nodes: [variant("a", "1.00", [], false)] } })
        .quickAddVariantId,
    ).toBeNull();
    expect(cardOffer({})).toEqual({
      subscribe: null,
      savingPercent: null,
      quickAddVariantId: null,
    });
  });
});
