import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { isFromShopify, queryFailed, tagsForDelivery } from "./shopify-events";

const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body, "utf8").digest("base64");

describe("isFromShopify", () => {
  const body = '{"topic":"Product"}';

  it("accepts Shopify's signature", () => {
    expect(isFromShopify(body, sign(body, "s3cret"), "s3cret")).toBe(true);
  });

  it.each([
    ["another secret", sign(body, "other")],
    ["a changed body", sign(`${body} `, "s3cret")],
    ["no header", null],
    ["garbage", "not-base64!!"],
  ])("rejects %s", (_name, signature) => {
    expect(isFromShopify(body, signature, "s3cret")).toBe(false);
  });

  it("rejects everything when no secret is configured", () => {
    expect(isFromShopify(body, sign(body, ""), "")).toBe(false);
  });
});

describe("tagsForDelivery", () => {
  const product = {
    handle: "magnesium-glycinate",
    collections: { nodes: [{ handle: "best-sellers" }, { handle: "mind-focus" }] },
  };

  it("a price change clears the product and its collections", () => {
    expect(tagsForDelivery("Product", "update", { product })).toEqual([
      "product:magnesium-glycinate",
      "collection:best-sellers",
      "collection:mind-focus",
    ]);
  });

  it("a stock change reaches the product through the variant", () => {
    expect(
      tagsForDelivery("InventoryItem", "update", {
        inventoryItem: { variant: { product } },
      }),
    ).toContain("product:magnesium-glycinate");
  });

  it("a collection change clears it and the home page's cards", () => {
    expect(
      tagsForDelivery("Collection", "update", { collection: { handle: "performance" } }),
    ).toEqual(["collection:performance", "collections"]);
  });

  it("a create or delete also refreshes the cards and the sitemap, even without data", () => {
    expect(tagsForDelivery("Product", "delete", undefined)).toEqual([
      "collections",
      "sitemap",
    ]);
  });

  it("an unknown topic clears nothing", () => {
    expect(tagsForDelivery("Order", "update", {})).toEqual([]);
  });
});

describe("queryFailed", () => {
  const product = { product: { handle: "magnesium-glycinate" } };

  it("is true for an update whose query returned errors", () => {
    expect(
      queryFailed("Product", "update", [{ message: "Field doesn't exist" }], product),
    ).toBe(true);
  });

  it("is true for an update whose resource came back null, without errors", () => {
    expect(queryFailed("Product", "update", undefined, { product: null })).toBe(true);
    expect(
      queryFailed("InventoryItem", "update", undefined, {
        inventoryItem: { variant: null },
      }),
    ).toBe(true);
    expect(queryFailed("Collection", "update", [], {})).toBe(true);
  });

  it("is false with usable data, and for create and delete, which need none", () => {
    expect(queryFailed("Product", "update", undefined, product)).toBe(false);
    expect(
      queryFailed("Collection", "update", [], { collection: { handle: "best-sellers" } }),
    ).toBe(false);
    expect(queryFailed("Product", "delete", [{ message: "gone" }], null)).toBe(false);
    expect(queryFailed("Product", "create", undefined, null)).toBe(false);
  });
});
