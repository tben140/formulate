import { describe, expect, it } from "vitest";

import { campaignDays, campaignUplift, stockPlan, unitsByProduct } from "./stock-plan";
import type { ProductInfo } from "./types";

const product = (title: string, stock: (number | null)[]): ProductInfo => ({
  id: `gid://shopify/Product/${title}`,
  title,
  status: "ACTIVE",
  onOnlineStore: true,
  campaignId: null,
  variants: stock.map((s, i) => ({
    id: `v${i}`,
    price: "10.00",
    campaignId: null,
    stock: s,
  })),
});

describe("stockPlan", () => {
  const recent = unitsByProduct([
    { title: "Whey", quantity: 28 },
    { title: "Whey", quantity: 28 },
    { title: "Fibre", quantity: 7 },
  ]);

  it("forecasts from recent daily sales × days × uplift, short ones first", () => {
    const lines = stockPlan(
      [product("Fibre", [100]), product("Whey", [10, 5]), product("Shaker", [null])],
      recent,
      { days: 4 },
    );
    // Whey: 56 units / 28 days = 2 a day × 4 days × 3 = 24, against 15 on hand.
    expect(lines[0]).toMatchObject({
      product: "Whey",
      stock: 15,
      perDay: 2,
      expected: 24,
      short: true,
    });
    expect(lines.find((l) => l.product === "Fibre")).toMatchObject({
      expected: 3,
      short: false,
    });
    expect(lines.find((l) => l.product === "Shaker")).toMatchObject({
      stock: null,
      short: false,
    });
  });

  it("uses the uplift it's given", () => {
    const [whey] = stockPlan([product("Whey", [100])], recent, { days: 4, uplift: 1.5 });
    expect(whey?.expected).toBe(12);
  });
});

describe("campaignUplift and campaignDays", () => {
  it("compares a campaign's daily units with the usual", () => {
    const during = new Map([["Whey", 40]]);
    const usual = new Map([["Whey", 56]]);
    // 10 a day during 4 days, against 2 a day usually: 5×.
    expect(campaignUplift(during, 4, usual, 28)).toBe(5);
    expect(campaignUplift(new Map(), 4, usual, 28)).toBeNull();
  });

  it("measures a campaign in days", () => {
    expect(
      campaignDays(new Date("2026-11-27T00:00:00Z"), new Date("2026-12-01T00:00:00Z")),
    ).toBe(4);
  });
});
