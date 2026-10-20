import { describe, expect, it } from "vitest";

import {
  FREE_SHIPPING_THRESHOLD,
  freeShippingMessage,
  freeShippingProgress,
} from "./free-shipping";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

describe("freeShippingProgress", () => {
  it("counts down below the threshold", () => {
    expect(freeShippingProgress(gbp("27.50"))).toEqual({
      kind: "away",
      remaining: gbp("12.50"),
      fraction: 27.5 / 40,
    });
  });

  it("is unlocked exactly at the threshold, not a penny later", () => {
    expect(freeShippingProgress(gbp("40.00"))).toEqual({
      kind: "unlocked",
      fraction: 1,
    });
  });

  it("is one penny away one penny below it", () => {
    // The edge floats get wrong: 40 - 39.99 is 0.010000000000001563.
    const progress = freeShippingProgress(gbp("39.99"));
    expect(progress?.kind).toBe("away");
    expect(progress?.kind === "away" && progress.remaining).toEqual(gbp("0.01"));
  });

  it("stays unlocked above the threshold", () => {
    expect(freeShippingProgress(gbp("112.00"))?.kind).toBe("unlocked");
  });

  it("starts from nothing on an empty subtotal", () => {
    expect(freeShippingProgress(gbp("0.0"))).toEqual({
      kind: "away",
      remaining: gbp("40.00"),
      fraction: 0,
    });
  });

  it("shows nothing for a cart in another currency, rather than comparing 40 of it", () => {
    expect(freeShippingProgress({ amount: "50.00", currencyCode: "EUR" })).toBeNull();
  });

  it("shows nothing for an unreadable amount", () => {
    expect(freeShippingProgress(gbp("not a number"))).toBeNull();
  });

  it("respects a currency with no minor units", () => {
    const threshold = { amount: "5000", currencyCode: "JPY" };
    expect(freeShippingProgress({ amount: "3200", currencyCode: "JPY" }, threshold)).toEqual({
      kind: "away",
      remaining: { amount: "1800", currencyCode: "JPY" },
      fraction: 0.64,
    });
  });

  it("defaults to the store's £40", () => {
    expect(FREE_SHIPPING_THRESHOLD).toEqual(gbp("40.00"));
  });
});

describe("freeShippingMessage", () => {
  it("names the amount in the cart's currency", () => {
    const progress = freeShippingProgress(gbp("27.50"));
    expect(progress && freeShippingMessage(progress)).toBe(
      "You're £12.50 away from free standard delivery",
    );
  });

  it("says so once unlocked", () => {
    const progress = freeShippingProgress(gbp("40.00"));
    expect(progress && freeShippingMessage(progress)).toBe(
      "You've unlocked free standard delivery",
    );
  });
});
