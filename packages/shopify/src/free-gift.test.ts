import { describe, expect, it } from "vitest";

import { freeGiftFor, freeGiftMessage, giftLineToAdd, isNestedLine } from "./free-gift";

const shaker = {
  id: "gid://shopify/ProductVariant/900",
  availableForSale: true,
  product: { title: "Double Helix Shaker" },
};
const bottle = {
  id: "gid://shopify/ProductVariant/901",
  availableForSale: true,
  product: { title: "Bottle" },
};

describe("free gifts", () => {
  it("prefers the variant's gift, then the product's, in stock only", () => {
    expect(
      freeGiftFor(
        { freeGift: { reference: shaker } },
        { freeGift: { reference: bottle } },
      ),
    ).toBe(bottle);
    expect(freeGiftFor({ freeGift: { reference: shaker } }, { freeGift: null })).toBe(
      shaker,
    );
    expect(
      freeGiftFor({ freeGift: { reference: { ...shaker, availableForSale: false } } }),
    ).toBeNull();
    expect(freeGiftFor({ freeGift: null })).toBeNull();
    // A reference to something other than a variant reads as none.
    expect(freeGiftFor({ freeGift: { reference: {} } })).toBeNull();
  });

  it("says what's given and on what condition", () => {
    expect(freeGiftMessage(shaker)).toBe(
      "Free Double Helix Shaker with this product, while stocks last",
    );
  });

  it("adds one gift per product line", () => {
    const parent = {
      id: "line-1",
      merchandise: { id: "whey" },
      parentRelationship: null,
    };
    expect(giftLineToAdd([parent], "line-1", shaker)).toEqual({
      merchandiseId: shaker.id,
      quantity: 1,
      parent: { lineId: "line-1" },
    });
    const gift = {
      id: "line-2",
      merchandise: { id: shaker.id },
      parentRelationship: { parent: { id: "line-1" } },
    };
    expect(giftLineToAdd([parent, gift], "line-1", shaker)).toBeNull();
    expect(giftLineToAdd([parent], "line-1", null)).toBeNull();
    expect(isNestedLine(gift)).toBe(true);
    expect(isNestedLine(parent)).toBe(false);
  });
});
