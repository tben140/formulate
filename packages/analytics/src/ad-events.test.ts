import { describe, expect, it } from "vitest";

import {
  addToCart,
  beginCheckout,
  catalogueId,
  parseAdEvent,
  toGa4,
  toMetaPixel,
  toMetaServerEvent,
  viewItem,
} from "./ad-events";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

const magnesium = {
  id: "gid://shopify/Product/10846317740344",
  title: "Magnesium Glycinate",
  priceRange: { minVariantPrice: gbp("17.95") },
};

const line = (quantity: number) => ({
  quantity,
  merchandise: {
    id: "gid://shopify/ProductVariant/52871790788920",
    price: gbp("17.95"),
    product: { id: magnesium.id, title: magnesium.title },
  },
});

describe("catalogueId", () => {
  it("matches the ids Shopify's channel apps sync to Google and Meta", () => {
    expect(catalogueId(magnesium.id, "gid://shopify/ProductVariant/52871790788920")).toBe(
      "shopify_GB_10846317740344_52871790788920",
    );
    expect(catalogueId(magnesium.id)).toBe("shopify_GB_10846317740344");
  });
});

describe("events", () => {
  it("values an add at what was added, not the new cart total", () => {
    const event = addToCart(line(2), "e1");
    expect(event.value).toBe(35.9);
    expect(event.items).toEqual([
      {
        id: "shopify_GB_10846317740344_52871790788920",
        name: "Magnesium Glycinate",
        price: 17.95,
        quantity: 2,
      },
    ]);
  });

  it("rounds away float noise", () => {
    // 17.95 * 3 is 53.849999999999994 in floating point.
    expect(addToCart(line(3), "e1").value).toBe(53.85);
  });

  it("values a checkout at the cart subtotal, with every line", () => {
    const cart = { cost: { subtotalAmount: gbp("53.85") }, lines: { nodes: [line(3)] } };
    const event = beginCheckout(cart, "e2");
    expect(event).toMatchObject({
      name: "begin_checkout",
      value: 53.85,
      currency: "GBP",
    });
    expect(event.items).toHaveLength(1);
  });
});

describe("platform payloads", () => {
  const event = addToCart(line(1), "abc-123");

  it("builds GA4's recommended ecommerce event", () => {
    expect(toGa4(event)).toEqual([
      "event",
      "add_to_cart",
      {
        currency: "GBP",
        value: 17.95,
        items: [
          {
            item_id: "shopify_GB_10846317740344_52871790788920",
            item_name: "Magnesium Glycinate",
            price: 17.95,
            quantity: 1,
          },
        ],
      },
    ]);
  });

  it("gives the Pixel and the Conversions API the same name, data and event id", () => {
    const [, pixelName, pixelData, options] = toMetaPixel(event);
    const server = toMetaServerEvent(event, {
      eventTime: 1_800_000_000,
      sourceUrl: "https://shop.example/products/magnesium-glycinate",
      userAgent: "Mozilla/5.0",
    });
    expect(server.event_name).toBe(pixelName);
    expect(server.custom_data).toEqual(pixelData);
    expect(server.event_id).toBe(options.eventID);
  });

  it("calls a product page a product group, and a cart line a product", () => {
    expect(toMetaPixel(viewItem(magnesium, "e"))[2].content_type).toBe("product_group");
    expect(toMetaPixel(event)[2].content_type).toBe("product");
  });

  it("sends Meta no personal data beyond what the browser already gave it", () => {
    const server = toMetaServerEvent(event, {
      eventTime: 1,
      sourceUrl: "https://shop.example/",
      userAgent: "UA",
      fbp: "fb.1.1.1",
    });
    expect(Object.keys(server.user_data).sort()).toEqual(["client_user_agent", "fbp"]);
  });
});

describe("parseAdEvent", () => {
  const valid = addToCart(line(1), "abc-123");

  it("accepts what the storefront sends", () => {
    expect(parseAdEvent(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it("drops fields it doesn't know", () => {
    const parsed = parseAdEvent({ ...valid, user_data: { em: "x" }, extra: 1 });
    expect(parsed).not.toHaveProperty("user_data");
    expect(parsed).not.toHaveProperty("extra");
  });

  it.each([
    ["an unknown event", { ...valid, name: "purchase" }],
    ["a malformed event id", { ...valid, eventId: "a b" }],
    ["a lowercase currency", { ...valid, currency: "gbp" }],
    ["a negative value", { ...valid, value: -1 }],
    ["an absurd value", { ...valid, value: 1e9 }],
    ["no items", { ...valid, items: [] }],
    [
      "an item id that isn't a catalogue id",
      { ...valid, items: [{ ...valid.items[0], id: "x" }] },
    ],
    [
      "a fractional quantity",
      { ...valid, items: [{ ...valid.items[0], quantity: 1.5 }] },
    ],
    ["not an object", "add_to_cart"],
  ])("rejects %s", (_, input) => {
    expect(parseAdEvent(input)).toBeNull();
  });
});
