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

const STORE_ORIGIN = "https://tben140plus-xcorpito.myshopify.com";
const SITE_ORIGIN = "https://www.doublehelixsupplements.co.uk";

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
  it("links to the product on the site origin it is given", () => {
    // Klaviyo emails link to whatever is in URL, so this must be the public
    // site, not the password-protected myshopify host the client talks to.
    expect(productUrl(SITE_ORIGIN, "selling-plans-ski-wax")).toBe(
      "https://www.doublehelixsupplements.co.uk/products/selling-plans-ski-wax",
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(productUrl(`${SITE_ORIGIN}/`, "x")).toBe(`${SITE_ORIGIN}/products/x`);
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
    expect(viewedProduct(product, STORE_ORIGIN)).toEqual(THEME_VIEWED_PRODUCT);
  });

  it("keeps Price symbol-bearing and Value bare", () => {
    // Klaviyo displays Price in emails and does arithmetic on Value. Swapping
    // them gives flows that compare "£9.95" numerically.
    const payload = viewedProduct(product, STORE_ORIGIN);
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
    const payload = viewedProduct(bare, STORE_ORIGIN);
    expect(payload.Brand).toBe("");
    expect(payload.ImageURL).toBe("");
    expect(payload.CompareAtPrice).toBe("");
  });
});

/**
 * `Categories`, captured from the running theme on 2026-09-26 (SHO-126).
 *
 * The 2026-08-08 reference above was a product in no collections, so its
 * `Categories: []` matched a hardcoded `[]` and the gap went unnoticed. These
 * are products that ARE in collections, with the theme's own values.
 *
 * ⚠️ The theme sorts by title; the Storefront API returns collections in
 * creation order. Daily Multivitamin is the case that tells them apart:
 * Storefront gives Cellular, Best Sellers, Daily Essentials.
 */
describe("viewedProduct — Categories", () => {
  const inCollections = (...titles: string[]) => ({
    id: "gid://shopify/Product/10846318231864",
    handle: "daily-multivitamin",
    title: "Daily Multivitamin",
    vendor: "Double Helix",
    featuredImage: null,
    priceRange: { minVariantPrice: { amount: "15.95", currencyCode: "GBP" } },
    compareAtPriceRange: null,
    collections: { nodes: titles.map((title) => ({ title })) },
  });

  it("matches the theme for a product in several collections", () => {
    // Order as the Storefront API returned it on 2026-09-26.
    const product = inCollections("Cellular", "Best Sellers", "Daily Essentials");
    expect(viewedProduct(product, STORE_ORIGIN).Categories).toEqual([
      "Best Sellers",
      "Cellular",
      "Daily Essentials",
    ]);
  });

  it("keeps punctuation in titles as the theme sends it", () => {
    // The theme's HTML shows "Mind \u0026 Focus": JSON escaping, not the value.
    const product = inCollections("Best Sellers", "Daily Essentials", "Mind & Focus");
    expect(viewedProduct(product, STORE_ORIGIN).Categories).toEqual([
      "Best Sellers",
      "Daily Essentials",
      "Mind & Focus",
    ]);
  });

  it("sends an empty list for a product in no collections", () => {
    expect(viewedProduct(inCollections(), STORE_ORIGIN).Categories).toEqual([]);
  });
});

const line = (overrides: Record<string, unknown> = {}) => ({
  quantity: 2,
  cost: { totalAmount: { amount: "49.90", currencyCode: "GBP" } },
  merchandise: {
    id: "gid://shopify/ProductVariant/52607188009272",
    image: { url: "/cdn/shop/files/wax.png" },
    price: { amount: "24.95", currencyCode: "GBP" },
    product: {
      id: "gid://shopify/Product/10762122068280",
      handle: "selling-plans-ski-wax",
      title: "Selling Plans Ski Wax",
      // Storefront order; the payload sorts them as the theme does.
      collections: { nodes: [{ title: "Cellular" }, { title: "Best Sellers" }] },
    },
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
    const payload = addedToCart(cart(), line(), SITE_ORIGIN, 1);
    expect(payload.$value).toBe(49.9);
    // The line holds 2 after this add, but the add put in 1.
    expect(payload.AddedItemQuantity).toBe(1);
    expect(payload.AddedItemPrice).toBe("£24.95");
    expect(payload.ItemNames).toEqual(["Selling Plans Ski Wax"]);
  });

  it("identifies the product by its product id, as Viewed Product does", () => {
    // The variant id went here until 2026-11-15, and matched no Viewed Product
    // and no product block in a flow email. The variant now rides alongside.
    const payload = addedToCart(cart(), line(), SITE_ORIGIN, 1);
    expect(payload.AddedItemProductID).toBe(10762122068280);
    expect(payload.AddedItemVariantID).toBe(52607188009272);
    expect(payload.Items[0]?.ProductID).toBe(10762122068280);
    expect(payload.Items[0]?.VariantID).toBe(52607188009272);
  });

  it("links to the public site and lists the categories, like Viewed Product", () => {
    const payload = addedToCart(cart(), line(), SITE_ORIGIN, 1);
    expect(payload.AddedItemURL).toBe(`${SITE_ORIGIN}/products/selling-plans-ski-wax`);
    expect(payload.AddedItemCategories).toEqual(["Best Sellers", "Cellular"]);
    expect(payload.Items[0]?.ProductURL).toBe(payload.AddedItemURL);
    expect(payload.Items[0]?.ProductCategories).toEqual(["Best Sellers", "Cellular"]);
  });
});

describe("startedCheckout", () => {
  it("computes RowTotal as price times quantity", () => {
    const payload = startedCheckout(cart(), SITE_ORIGIN);
    expect(payload.Items[0]?.ItemPrice).toBe("£24.95");
    expect(payload.Items[0]?.RowTotal).toBe("£49.90");
  });

  it("reports the charged price, not the list price, for a subscription line", () => {
    // Two units listed at £24.95, charged £19.95 each on the plan.
    const onPlan = line({
      cost: { totalAmount: { amount: "39.90", currencyCode: "GBP" } },
    });
    const item = startedCheckout(cart([onPlan]), SITE_ORIGIN).Items[0];
    expect(item?.ItemPrice).toBe("£19.95");
    expect(item?.RowTotal).toBe("£39.90");
    expect(addedToCart(cart([onPlan]), onPlan, SITE_ORIGIN, 1).AddedItemPrice).toBe(
      "£19.95",
    );
  });

  it("identifies each line by product id, with the variant beside it", () => {
    const item = startedCheckout(cart(), SITE_ORIGIN).Items[0];
    expect(item?.ProductID).toBe(10762122068280);
    expect(item?.VariantID).toBe(52607188009272);
    expect(item?.ProductURL).toBe(`${SITE_ORIGIN}/products/selling-plans-ski-wax`);
  });

  it("labels a subscription line so flows can tell it apart", () => {
    // The entire Recharge story depends on a flow being able to distinguish a
    // subscription from a one-off.
    expect(startedCheckout(cart(), STORE_ORIGIN).Items[0]?.SellingPlanName).toBe(
      "Delivery every 30 days",
    );
  });

  it("uses null, not an empty string, for a one-time line", () => {
    const oneOff = startedCheckout(
      cart([line({ sellingPlanAllocation: null })]),
      STORE_ORIGIN,
    );
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
