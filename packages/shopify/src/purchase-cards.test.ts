import { describe, expect, it } from "vitest";

import { ONE_TIME } from "./product-selection";
import { addButtonLabel, bestValueIndex, purchaseCards } from "./purchase-cards";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const plan = (days: number, price: string) => ({
  sellingPlan: {
    id: `plan-${days}`,
    name: `${days} day subscription with 15% discount`,
    options: [{ name: "Order Frequency and Unit", value: `${days}-day` }],
  },
  priceAdjustments: [{ price: gbp(price) }],
});

describe("purchase cards", () => {
  it("names each plan by its supply, shortest first, with one-time last", () => {
    const cards = purchaseCards(
      { price: gbp("15.95"), selectedOptions: [{ name: "Pack size", value: "30 days" }] },
      [plan(90, "13.56"), plan(30, "13.56")],
    );
    expect(cards.map((c) => [c.title, c.detail, c.perDay, c.savePercent])).toEqual([
      ["30-day supply", "Delivered every 30 days", "45p a day", 15],
      ["90-day supply", "3 × 30-day packs, delivered every 90 days", "45p a day", 15],
      ["One-time purchase", "30-day supply", "53p a day", null],
    ]);
    expect(cards[1]!.quote.price).toEqual(gbp("40.68"));
    expect(cards.at(-1)!.id).toBe(ONE_TIME);
  });

  it("prices a 90-day pack as one unit", () => {
    const [card] = purchaseCards(
      { price: gbp("47.95"), selectedOptions: [{ name: "Pack size", value: "90 days" }] },
      [plan(90, "40.76")],
    );
    expect(card).toMatchObject({
      title: "90-day supply",
      detail: "Delivered every 90 days",
    });
    expect(card!.quote).toMatchObject({ units: 1, days: 90, price: gbp("40.76") });
  });

  it("names the deal on the button", () => {
    const cards = purchaseCards({ price: gbp("15.95"), selectedOptions: [] }, [
      plan(30, "13.56"),
    ]);
    expect(cards.map(addButtonLabel)).toEqual([
      "Subscribe and save 15% – £13.56",
      "Add to cart – £15.95",
    ]);
    expect(addButtonLabel(undefined)).toBe("Add to cart");
    expect(purchaseCards(undefined, [])).toEqual([]);
  });

  it("tags no plan best value while every plan saves the same", () => {
    const cards = purchaseCards(
      { price: gbp("15.95"), selectedOptions: [{ name: "Pack size", value: "30 days" }] },
      [plan(30, "13.56"), plan(60, "13.56"), plan(90, "13.56")],
    );
    expect(cards.some((card) => card.bestValue)).toBe(false);
  });

  it("tags the plan that saves the most, when it saves more than the rest", () => {
    const cards = purchaseCards(
      { price: gbp("20.00"), selectedOptions: [{ name: "Pack size", value: "30 days" }] },
      [plan(90, "16.00"), plan(30, "18.00"), plan(60, "17.00")],
    );
    expect(cards.map((c) => [c.title, c.savePercent, c.perDay, c.bestValue])).toEqual([
      ["30-day supply", 10, "60p a day", false],
      ["60-day supply", 15, "57p a day", false],
      ["90-day supply", 20, "53p a day", true],
      ["One-time purchase", null, "67p a day", false],
    ]);
  });
});

describe("bestValueIndex", () => {
  it("is the one highest saving, or none", () => {
    expect(bestValueIndex([10, 15, 20])).toBe(2);
    expect(bestValueIndex([20, 15, 20])).toBe(-1);
    expect(bestValueIndex([null, 0])).toBe(-1);
    expect(bestValueIndex([null, 5])).toBe(1);
    // A lone plan has nothing to beat.
    expect(bestValueIndex([20])).toBe(-1);
  });
});
