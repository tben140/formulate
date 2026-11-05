import { describe, expect, it } from "vitest";

import {
  limitMessage,
  MAX_PER_PRODUCT,
  maxQuantityForLine,
  quantityOfProduct,
} from "./cart-limit";

const line = (id: string, product: string | null, quantity: number) => ({
  id,
  quantity,
  merchandise: { product: product ? { id: product } : null },
});

describe("cart limit helpers", () => {
  const lines = [
    line("a", "magnesium", 4), // one-off
    line("b", "magnesium", 1), // subscription of the same product
    line("c", "vitamin-d3", 2),
  ];

  it("counts a product across all its lines", () => {
    expect(quantityOfProduct(lines, "magnesium")).toBe(5);
  });

  it("caps a line at the limit minus the product's other lines", () => {
    expect(maxQuantityForLine(lines, "a")).toBe(5); // 6 - 1 on line b
    expect(maxQuantityForLine(lines, "b")).toBe(2); // 6 - 4 on line a
    expect(maxQuantityForLine(lines, "c")).toBe(MAX_PER_PRODUCT);
  });

  it("never goes below zero, and is generous for lines it can't place", () => {
    expect(maxQuantityForLine([line("x", "p", 3), line("y", "p", 9)], "x")).toBe(0);
    expect(maxQuantityForLine(lines, "missing")).toBe(MAX_PER_PRODUCT);
    expect(maxQuantityForLine([line("z", null, 2)], "z")).toBe(MAX_PER_PRODUCT);
  });

  it("uses the Function's wording", () => {
    expect(limitMessage("Magnesium Glycinate")).toBe(
      "You can buy up to 6 of Magnesium Glycinate in one order.",
    );
  });
});
