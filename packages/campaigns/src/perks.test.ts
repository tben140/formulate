import { describe, expect, it } from "vitest";

import { PERK_PROPERTY, perkKey, planPerks } from "./perks";

const END = new Date("2026-12-01T00:00:00Z");

describe("planPerks", () => {
  it("adds one per subscription to its next charge after the campaign", () => {
    expect(
      planPerks(
        "black-friday-2026",
        END,
        [
          { id: 1, addressId: 10, nextChargeDate: "2026-12-04" },
          { id: 2, addressId: 10, nextChargeDate: "2026-12-01" },
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
        { id: 1, addressId: 10, nextChargeDate: "2026-11-30" },
        { id: 2, addressId: 11, nextChargeDate: null },
        { id: 3, addressId: 12, nextChargeDate: "2026-12-10" },
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
      [{ id: 3, addressId: 12, nextChargeDate: "2026-12-10" }],
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
