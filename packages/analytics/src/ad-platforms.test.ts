import { describe, expect, it } from "vitest";

import { addToCart, beginCheckout, viewItem, type AdEvent } from "./ad-events";
import {
  toPinterestServerEvent,
  toPinterestTag,
  toRedditPixel,
  toSnapPixel,
  toSnapServerEvent,
  toTikTokPixel,
  toTikTokServerEvent,
  toUet,
  type ServerContext,
} from "./ad-platforms";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const product = {
  id: "gid://shopify/Product/1",
  title: "Magnesium Glycinate",
  priceRange: { minVariantPrice: gbp("17.95") },
};
const line = {
  quantity: 2,
  merchandise: {
    id: "gid://shopify/ProductVariant/2",
    price: gbp("17.95"),
    product: { id: product.id, title: product.title },
  },
};
const cart = { cost: { subtotalAmount: gbp("35.90") }, lines: { nodes: [line] } };

const events: readonly AdEvent[] = [
  viewItem(product, "id-view"),
  addToCart(line, "id-add"),
  beginCheckout(cart, "id-checkout"),
];
const context: ServerContext = {
  eventTime: 1_800_000_000,
  sourceUrl: "https://shop.example/products/magnesium-glycinate",
  userAgent: "UA",
  ipAddress: "203.0.113.7",
  cookies: { ttp: "ttp-1", epik: "epik-1", scid: "scid-1" },
};

describe("event names", () => {
  it("uses each platform's own names", () => {
    expect(events.map((e) => toTikTokPixel(e)[0])).toEqual([
      "ViewContent",
      "AddToCart",
      "InitiateCheckout",
    ]);
    expect(events.map((e) => toSnapPixel(e)[1])).toEqual([
      "VIEW_CONTENT",
      "ADD_CART",
      "START_CHECKOUT",
    ]);
    expect(events.map((e) => toUet(e)[1])).toEqual([
      "view_item",
      "add_to_cart",
      "begin_checkout",
    ]);
  });

  it("sends Pinterest and Reddit nothing for begin checkout, which they'd count as a sale", () => {
    const checkout = events[2]!;
    expect(toPinterestTag(checkout)).toBeNull();
    expect(toPinterestServerEvent(checkout, context)).toBeNull();
    expect(toRedditPixel(checkout)).toBeNull();
    expect(toPinterestTag(events[1]!)?.[1]).toBe("addtocart");
    expect(toRedditPixel(events[1]!)?.[1]).toBe("AddToCart");
  });
});

describe("deduplication", () => {
  const add = events[1]!;

  it("gives the browser and server copies the same id", () => {
    expect(toTikTokPixel(add)[2].event_id).toBe(
      toTikTokServerEvent(add, context).event_id,
    );
    expect(toSnapPixel(add)[2].client_dedup_id).toBe(
      toSnapServerEvent(add, context).event_id,
    );
    expect(toPinterestTag(add)?.[2].event_id).toBe(
      toPinterestServerEvent(add, context)?.event_id,
    );
    expect(toRedditPixel(add)?.[2].conversionId).toBe("id-add");
  });

  it("gives the browser and server copies the same event", () => {
    expect(toTikTokServerEvent(add, context).event).toBe(toTikTokPixel(add)[0]);
    expect(toTikTokServerEvent(add, context).properties).toEqual(toTikTokPixel(add)[1]);
    expect(toSnapServerEvent(add, context).event_name).toBe(toSnapPixel(add)[1]);
  });
});

describe("server payloads", () => {
  const add = events[1]!;

  it("carry each platform's own browser id from its cookie", () => {
    expect(toTikTokServerEvent(add, context).user.ttp).toBe("ttp-1");
    expect(toPinterestServerEvent(add, context)?.user_data.click_id).toBe("epik-1");
    expect(toSnapServerEvent(add, context).user_data.sc_cookie1).toBe("scid-1");
  });

  it("send Pinterest money as strings", () => {
    const custom = toPinterestServerEvent(add, context)?.custom_data;
    expect(custom?.value).toBe("35.90");
    expect(custom?.contents[0]?.item_price).toBe("17.95");
  });

  it("send no personal data beyond the request's own", () => {
    for (const payload of [
      toTikTokServerEvent(add, context).user,
      toPinterestServerEvent(add, context)?.user_data ?? {},
      toSnapServerEvent(add, context).user_data,
    ]) {
      expect(JSON.stringify(payload)).not.toMatch(/em|ph|email|phone/i);
    }
  });
});
