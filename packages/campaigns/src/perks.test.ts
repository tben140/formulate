import { describe, expect, it } from "vitest";

import { inSegment, PERK_PROPERTY, perkKey, planPerks } from "./perks";

const END = new Date("2026-12-01T00:00:00Z");

describe("planPerks", () => {
  it("adds one per subscription to its next charge after the campaign", () => {
    expect(
      planPerks(
        "black-friday-2026",
        END,
        [
          { id: 1, customerId: 100, addressId: 10, nextChargeDate: "2026-12-04" },
          { id: 2, customerId: 100, addressId: 10, nextChargeDate: "2026-12-01" },
        ],
        [],
      ),
    ).toEqual({
      add: [
        { subscriptionId: 1, addressId: 10, date: "2026-12-04" },
        { subscriptionId: 2, addressId: 10, date: "2026-12-01" },
      ],
      skip: [],
    });
  });

  it("skips charges during the campaign, ones without a charge, and perks already added", () => {
    const plan = planPerks(
      "black-friday-2026",
      END,
      [
        { id: 1, customerId: 100, addressId: 10, nextChargeDate: "2026-11-30" },
        { id: 2, customerId: 100, addressId: 11, nextChargeDate: null },
        { id: 3, customerId: 100, addressId: 12, nextChargeDate: "2026-12-10" },
      ],
      [
        {
          addressId: 12,
          properties: [{ name: PERK_PROPERTY, value: perkKey("black-friday-2026", 3) }],
        },
      ],
    );
    expect(plan.add).toEqual([]);
    expect(plan.skip).toEqual([
      {
        subscriptionId: 1,
        reason: "next charge 2026-11-30 isn't after the campaign; run again later",
      },
      { subscriptionId: 2, reason: "no next charge scheduled" },
      { subscriptionId: 3, reason: "already added" },
    ]);
  });

  it("doesn't count another campaign's perk", () => {
    const plan = planPerks(
      "black-friday-2026",
      END,
      [{ id: 3, customerId: 100, addressId: 12, nextChargeDate: "2026-12-10" }],
      [
        {
          addressId: 12,
          properties: [{ name: PERK_PROPERTY, value: perkKey("summer-2026", 3) }],
        },
      ],
    );
    expect(plan.add).toHaveLength(1);
  });
});

describe("inSegment", () => {
  const sub = (id: number, customerId: number) => ({
    id,
    customerId,
    addressId: 10,
    nextChargeDate: "2026-12-04",
  });

  it("keeps only subscriptions whose Shopify customer is in the segment", () => {
    const shopifyIdOf = new Map([
      [100, "gid://shopify/Customer/1"],
      [200, "gid://shopify/Customer/2"],
    ]);
    expect(
      inSegment([sub(1, 100), sub(2, 200), sub(3, 300)], shopifyIdOf, [
        "gid://shopify/Customer/2",
      ]).map((s) => s.id),
    ).toEqual([2]);
  });

  it("leaves out a Recharge customer with no Shopify customer", () => {
    expect(inSegment([sub(1, 300)], new Map(), ["gid://shopify/Customer/3"])).toEqual([]);
  });
});
