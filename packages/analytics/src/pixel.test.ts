import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { CART_ATTRIBUTES, POSTHOG_HOST, PRODUCT_EVENTS } from "./product-analytics";

/**
 * Runs pixel/posthog.js the way Shopify does: as a script with `analytics`,
 * `browser` and `fetch` in scope. The pixel can't import the shared module, so
 * these tests are what keep its event names and cart attribute keys in step
 * with it.
 */
const SOURCE = readFileSync(new URL("../pixel/posthog.js", import.meta.url), "utf8");

type Handler = (event: unknown) => void;

interface SentBody {
  readonly event: string;
  readonly distinct_id: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

const loadPixel = (key = "phc_test") => {
  const handlers = new Map<string, Handler>();
  const analytics = {
    subscribe: (name: string, handler: Handler) => handlers.set(name, handler),
  };
  const storage = new Map<string, string>();
  const browser = {
    sessionStorage: {
      getItem: (k: string) => Promise.resolve(storage.get(k) ?? null),
      setItem: (k: string, v: string) => Promise.resolve(void storage.set(k, v)),
    },
  };
  const fetchMock = vi.fn((_url: string, _init: { body: string }) => Promise.resolve({}));

  new Function(
    "analytics",
    "browser",
    "fetch",
    SOURCE.replace(
      `const POSTHOG_KEY = "__POSTHOG_KEY__"`,
      `const POSTHOG_KEY = "${key}"`,
    ),
  )(analytics, browser, fetchMock);

  /** Fires a Shopify event and returns what reached PostHog, if anything. */
  const fire = async (name: string, data: unknown, pathname = "/products/x") => {
    fetchMock.mockClear();
    handlers.get(name)?.({
      name,
      clientId: "shopify-client-id",
      timestamp: "2026-10-15T12:00:00.000Z",
      context: {
        document: { location: { href: `https://shop.example${pathname}`, pathname } },
      },
      data,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const call = fetchMock.mock.calls[0];
    return call ? { url: call[0], body: JSON.parse(call[1].body) as SentBody } : null;
  };

  return { fire, handlers };
};

const money = (value: number) => ({ amount: value, currencyCode: "GBP" });

const product = {
  id: "gid://shopify/Product/10940384149816",
  title: "Magnesium Glycinate",
  url: "/products/magnesium-glycinate",
};

const checkout = (attributes: { key: string; value: string }[]) => ({
  attributes,
  currencyCode: "GBP",
  subtotalPrice: money(35.9),
  totalPrice: money(39.85),
  order: { id: "gid://shopify/Order/6500000000001" },
  lineItems: [
    { quantity: 2, sellingPlanAllocation: { sellingPlan: { name: "30 day" } } },
    { quantity: 1, sellingPlanAllocation: null },
  ],
});

describe("PostHog custom pixel", () => {
  it("sends only events the shared schema defines", () => {
    const shared = new Set<string>([...Object.values(PRODUCT_EVENTS), "$pageview"]);
    const used = [...SOURCE.matchAll(/:\s*"([a-z_$]+)",?\s*$/gm)]
      .map((match) => match[1])
      .filter((name) => name && /_|\$/.test(name) && !name.startsWith("_"));
    for (const name of used) expect(shared, name).toContain(name);
    expect(SOURCE).toContain(`distinctId: "${CART_ATTRIBUTES.distinctId}"`);
    expect(SOURCE).toContain(`surface: "${CART_ATTRIBUTES.surface}"`);
    expect(SOURCE).toContain(`"${POSTHOG_HOST}"`);
  });

  it("sends a theme product view under Shopify's browser id", async () => {
    const { fire } = loadPixel();
    const sent = await fire("product_viewed", {
      productVariant: {
        id: "gid://shopify/ProductVariant/1",
        price: money(17.95),
        product,
      },
    });

    expect(sent?.url).toBe(`${POSTHOG_HOST}/i/v0/e/`);
    expect(sent?.body).toMatchObject({
      api_key: "phc_test",
      event: PRODUCT_EVENTS.productViewed,
      distinct_id: "shopify-client-id",
      properties: {
        product_id: "10940384149816",
        product_handle: "magnesium-glycinate",
        product_title: "Magnesium Glycinate",
        price: 17.95,
        currency: "GBP",
        surface: "theme",
        $lib: "formulate-pixel",
      },
    });
    expect(sent?.body.properties.$session_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it("reports a theme add as what was added, priced per unit", async () => {
    const { fire } = loadPixel();
    const sent = await fire("product_added_to_cart", {
      cartLine: {
        quantity: 2,
        cost: { totalAmount: money(35.9) },
        merchandise: { id: "gid://shopify/ProductVariant/53092466032952", product },
      },
    });
    expect(sent?.body.properties).toMatchObject({
      variant_id: "53092466032952",
      quantity: 2,
      price: 17.95,
      selling_plan: null,
    });
  });

  it("credits a web cart's order to the web visitor", async () => {
    const { fire } = loadPixel();
    const sent = await fire(
      "checkout_completed",
      {
        checkout: checkout([
          { key: CART_ATTRIBUTES.distinctId, value: "web-visitor-id" },
          { key: CART_ATTRIBUTES.surface, value: "web" },
        ]),
      },
      "/checkouts/cn/abc/thank-you",
    );
    expect(sent?.body).toMatchObject({
      event: PRODUCT_EVENTS.orderCompleted,
      distinct_id: "web-visitor-id",
      properties: {
        order_id: "6500000000001",
        item_count: 3,
        order_value: 39.85,
        currency: "GBP",
        has_subscription: true,
        surface: "web",
      },
    });
  });

  it("treats an untagged cart's order as the theme's", async () => {
    const { fire } = loadPixel();
    const sent = await fire("checkout_completed", { checkout: checkout([]) });
    expect(sent?.body).toMatchObject({
      distinct_id: "shopify-client-id",
      properties: { surface: "theme" },
    });
  });

  it("leaves checkout_started to web and the app for their own carts", async () => {
    const { fire } = loadPixel();
    const app = checkout([{ key: CART_ATTRIBUTES.surface, value: "app" }]);
    expect(await fire("checkout_started", { checkout: app })).toBeNull();

    const theme = await fire("checkout_started", { checkout: checkout([]) });
    expect(theme?.body).toMatchObject({
      event: PRODUCT_EVENTS.checkoutStarted,
      properties: { item_count: 3, cart_value: 35.9, has_subscription: true },
    });
  });

  it("skips checkout page views, and sends the theme's", async () => {
    const { fire } = loadPixel();
    expect(await fire("page_viewed", {}, "/checkouts/cn/abc")).toBeNull();
    expect((await fire("page_viewed", {}, "/collections/best-sellers"))?.body.event).toBe(
      "$pageview",
    );
  });

  it("sends nothing until the key placeholder is replaced", async () => {
    const { fire } = loadPixel("__POSTHOG_KEY__");
    expect(await fire("page_viewed", {}, "/")).toBeNull();
  });
});
