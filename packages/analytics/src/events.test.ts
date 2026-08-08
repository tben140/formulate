import { describe, expect, it } from "vitest";

import {
  EVENTS,
  addedToCart,
  formatEventPrice,
  legacyIdFromGid,
  productUrl,
  startedCheckout,
  viewedProduct,
} from "./events";

const DOMAIN = "tben140plus-xcorpito.myshopify.com";

/**
 * The reference payload, captured from the running Liquid theme on 2026-08-08.
 * These tests exist to keep the headless surfaces matching it — a divergence
 * here is invisible in Klaviyo until a flow quietly stops firing.
 */
const THEME_VIEWED_PRODUCT = {
  Name: "Selling Plans Ski Wax",
  ProductID: 10762122068280,
  Categories: [],
  ImageURL: "/cdn/shop/files/snowboard_wax_grande.png?v=1783280473",
  URL: "https://tben140plus-xcorpito.myshopify.com/products/selling-plans-ski-wax",
  Brand: "tben140plus",
  Price: "£9.95",
  Value: "9.95",
  CompareAtPrice: "£0.00",
};

describe("legacyIdFromGid", () => {
  it("extracts the numeric id Klaviyo expects", () => {
    // The single most consequential line here. Sending the gid instead splits
    // segments in two with no error anywhere.
    expect(legacyIdFromGid("gid://shopify/Product/10762122068280")).toBe(10762122068280);
  });

  it("handles variant gids the same way", () => {
    expect(legacyIdFromGid("gid://shopify/ProductVariant/52607188009272")).toBe(
      52607188009272,
    );
  });

  it("strips a query suffix", () => {
    expect(legacyIdFromGid("gid://shopify/Cart/abc123?key=secret")).toBe(0);
  });

  it("returns 0 rather than throwing on rubbish", () => {
    // Analytics must never take down a product page.
    expect(legacyIdFromGid("")).toBe(0);
    expect(legacyIdFromGid("not-a-gid")).toBe(0);
    expect(legacyIdFromGid("gid://shopify/Product/")).toBe(0);
  });
});

describe("formatEventPrice", () => {
  it("includes the currency symbol, as the theme does", () => {
    expect(formatEventPrice({ amount: "9.95", currencyCode: "GBP" })).toBe("£9.95");
  });

  it("formats zero as the theme does for a missing compare-at price", () => {
    expect(formatEventPrice({ amount: "0.0", currencyCode: "GBP" })).toBe("£0.00");
  });

  it("returns an empty string for null rather than 'NaN'", () => {
    expect(formatEventPrice(null)).toBe("");
    expect(formatEventPrice(undefined)).toBe("");
    expect(formatEventPrice({ amount: "oops", currencyCode: "GBP" })).toBe("");
  });
});

describe("productUrl", () => {
  it("always points at the Online Store, whichever surface fired the event", () => {
    // Klaviyo emails link to whatever is in URL. A mobile-triggered
    // browse-abandonment email has nowhere else sensible to point.
    expect(productUrl(DOMAIN, "selling-plans-ski-wax")).toBe(THEME_VIEWED_PRODUCT.URL);
  });
});

describe("viewedProduct", () => {
  const product = {
    id: "gid://shopify/Product/10762122068280",
    handle: "selling-plans-ski-wax",
    title: "Selling Plans Ski Wax",
    vendor: "tben140plus",
    featuredImage: { url: "/cdn/shop/files/snowboard_wax_grande.png?v=1783280473" },
    priceRange: { minVariantPrice: { amount: "9.95", currencyCode: "GBP" } },
    compareAtPriceRange: { minVariantPrice: { amount: "0.0", currencyCode: "GBP" } },
  };

  it("reproduces the theme's payload exactly", () => {
    expect(viewedProduct(product, DOMAIN)).toEqual(THEME_VIEWED_PRODUCT);
  });

  it("keeps Price symbol-bearing and Value bare", () => {
    // Klaviyo displays Price in emails and does arithmetic on Value. Swapping
    // them gives flows that compare "£9.95" numerically.
    const payload = viewedProduct(product, DOMAIN);
    expect(payload.Price).toBe("£9.95");
    expect(payload.Value).toBe("9.95");
  });

  it("survives a product with no vendor, image or compare-at price", () => {
    const bare = {
      ...product,
      vendor: null,
      featuredImage: null,
      compareAtPriceRange: null,
    };
    const payload = viewedProduct(bare, DOMAIN);
    expect(payload.Brand).toBe("");
    expect(payload.ImageURL).toBe("");
    expect(payload.CompareAtPrice).toBe("");
  });
});

const line = (overrides: Record<string, unknown> = {}) => ({
  quantity: 2,
  merchandise: {
    id: "gid://shopify/ProductVariant/52607188009272",
    image: { url: "/cdn/shop/files/wax.png" },
    price: { amount: "24.95", currencyCode: "GBP" },
    product: { handle: "selling-plans-ski-wax", title: "Selling Plans Ski Wax" },
  },
  sellingPlanAllocation: { sellingPlan: { name: "Delivery every 30 days" } },
  ...overrides,
});

const cart = (lines = [line()]) => ({
  checkoutUrl: "https://tben140plus-xcorpito.myshopify.com/cart/c/abc?key=xyz",
  cost: { subtotalAmount: { amount: "49.90", currencyCode: "GBP" } },
  lines: { nodes: lines },
});

describe("addedToCart", () => {
  it("carries the cart value and the added line", () => {
    const payload = addedToCart(cart(), line(), DOMAIN);
    expect(payload.$value).toBe(49.9);
    expect(payload.AddedItemProductID).toBe(52607188009272);
    expect(payload.AddedItemQuantity).toBe(2);
    expect(payload.AddedItemPrice).toBe("£24.95");
    expect(payload.ItemNames).toEqual(["Selling Plans Ski Wax"]);
  });
});

describe("startedCheckout", () => {
  it("computes RowTotal as price times quantity", () => {
    const payload = startedCheckout(cart(), DOMAIN);
    expect(payload.Items[0]?.ItemPrice).toBe("£24.95");
    expect(payload.Items[0]?.RowTotal).toBe("£49.90");
  });

  it("labels a subscription line so flows can tell it apart", () => {
    // The entire Recharge story depends on a flow being able to distinguish a
    // subscription from a one-off.
    expect(startedCheckout(cart(), DOMAIN).Items[0]?.SellingPlanName).toBe(
      "Delivery every 30 days",
    );
  });

  it("uses null, not an empty string, for a one-time line", () => {
    const oneOff = startedCheckout(cart([line({ sellingPlanAllocation: null })]), DOMAIN);
    expect(oneOff.Items[0]?.SellingPlanName).toBeNull();
  });
});

describe("EVENTS", () => {
  it("uses the exact names the theme emits", () => {
    // Klaviyo matches on the literal string. "viewed_product" would be a
    // different event with its own, empty, history.
    expect(EVENTS.viewedProduct).toBe("Viewed Product");
    expect(EVENTS.addedToCart).toBe("Added to Cart");
    expect(EVENTS.startedCheckout).toBe("Started Checkout");
  });
});
