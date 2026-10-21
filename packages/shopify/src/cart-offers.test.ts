import { describe, expect, it } from "vitest";

import {
  stackMessage,
  stackProgress,
  subscribeOffer,
  subscribeOfferLabel,
} from "./cart-offers";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

const line = (
  options: {
    quantity?: number;
    subscribed?: boolean;
    product?: string;
    ownedPlan?: boolean;
  } = {},
) => ({
  quantity: options.quantity ?? 1,
  sellingPlanAllocation: options.subscribed ? { sellingPlan: { id: "plan-30" } } : null,
  merchandise: {
    price: gbp("15.95"),
    product: {
      id: options.product ?? "p-1",
      sellingPlanGroups: {
        nodes: [
          {
            appName: options.ownedPlan === false ? null : "Recharge",
            sellingPlans: { nodes: [{ id: "plan-30" }] },
          },
        ],
      },
    },
    sellingPlanAllocations: {
      nodes: [
        {
          sellingPlan: {
            id: "plan-30",
            name: "Delivery every 30 days",
            recurringDeliveries: true,
          },
          priceAdjustments: [{ price: gbp("13.56") }],
        },
      ],
    },
  },
});

describe("switch to subscribe", () => {
  it("offers the first managed subscription plan, with the saving for the whole line", () => {
    const offer = subscribeOffer(line({ quantity: 2 }));
    expect(offer).toEqual({
      sellingPlanId: "plan-30",
      planName: "Delivery every 30 days",
      saving: gbp("4.78"),
    });
    expect(offer && subscribeOfferLabel(offer)).toBe("Subscribe & save £4.78 a delivery");
  });

  it("offers nothing that isn't true", () => {
    expect(subscribeOffer(line({ subscribed: true }))).toBeNull();
    expect(subscribeOffer(line({ ownedPlan: false }))).toBeNull();
  });
});

describe("build your stack", () => {
  it("counts different products, subscriptions included", () => {
    expect(stackProgress([line()])).toEqual({ kind: "away", productsNeeded: 2 });
    expect(stackProgress([line(), line({ product: "p-2", subscribed: true })])).toEqual({
      kind: "away",
      productsNeeded: 1,
    });
    // Two of the same product are one product.
    expect(stackProgress([line(), line()])).toEqual({ kind: "away", productsNeeded: 2 });
  });

  it("says it applies, to one-time items, once there are three", () => {
    const progress = stackProgress([
      line(),
      line({ product: "p-2", subscribed: true }),
      line({ product: "p-3" }),
    ]);
    expect(progress && stackMessage(progress)).toBe(
      "Build your stack: 10% off your one-time items, at checkout",
    );
  });

  it("says nothing when there's no one-time item to discount", () => {
    expect(stackProgress([line({ subscribed: true })])).toBeNull();
    expect(stackProgress([])).toBeNull();
  });

  it("words the remainder", () => {
    expect(stackMessage({ kind: "away", productsNeeded: 1 })).toBe(
      "Add 1 more different product for 10% off your one-time items",
    );
    expect(stackMessage({ kind: "away", productsNeeded: 2 })).toBe(
      "Add 2 more different products for 10% off your one-time items",
    );
  });

  it("never counts or offers on a nested free gift", () => {
    const gift = {
      parentRelationship: { parent: { id: "line-1" } },
      sellingPlanAllocation: null,
      merchandise: { product: { id: "shaker" } },
    };
    const product = (id: string) => ({
      sellingPlanAllocation: null,
      merchandise: { product: { id } },
    });
    expect(stackProgress([product("a"), product("b"), gift])).toEqual({
      kind: "away",
      productsNeeded: 1,
    });
  });
});
