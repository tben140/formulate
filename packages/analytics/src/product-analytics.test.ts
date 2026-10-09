import { describe, expect, it, vi } from "vitest";

import {
  POSTHOG_HOST,
  addedToCartProperties,
  cartViewedProperties,
  checkoutStartedProperties,
  productViewedProperties,
  PRODUCT_EVENTS,
  anonymousId,
  captureBody,
  createProductAnalytics,
  numericId,
  sessionUuid,
  type FetchLike,
  type ProductAnalyticsConfig,
} from "./product-analytics";

const config = (fetchMock: FetchLike): ProductAnalyticsConfig => ({
  apiKey: "phc_test",
  surface: "web",
  identity: () => ({ distinctId: "anon-1", sessionId: "session-1" }),
  context: () => ({ $current_url: "https://shop.example/products/x" }),
  fetch: fetchMock,
});

const product = {
  product_id: "10940384149816",
  product_handle: "magnesium-glycinate",
  product_title: "Magnesium Glycinate",
};

/** The JSON body of the first request a fetch mock received. */
const bodyOf = (mock: ReturnType<typeof vi.fn>): Record<string, unknown> =>
  JSON.parse(
    String((mock.mock.calls[0] as unknown as [string, RequestInit])[1].body),
  ) as Record<string, unknown>;

describe("captureBody", () => {
  it("builds PostHog's capture body, surface and session on every event", () => {
    const body = captureBody(
      config(vi.fn()),
      PRODUCT_EVENTS.productViewed,
      { ...product, price: 17.95, currency: "GBP" },
      new Date("2026-10-09T10:00:00Z"),
    );
    expect(body).toEqual({
      api_key: "phc_test",
      event: "product_viewed",
      distinct_id: "anon-1",
      timestamp: "2026-10-09T10:00:00.000Z",
      properties: {
        $current_url: "https://shop.example/products/x",
        ...product,
        price: 17.95,
        currency: "GBP",
        surface: "web",
        $session_id: "session-1",
        $lib: "formulate-web",
      },
    });
  });

  it("can't be talked out of its surface or session by event properties", () => {
    const body = captureBody(config(vi.fn()), "x", {
      surface: "app",
      $session_id: "forged",
    });
    expect(body.properties.surface).toBe("web");
    expect(body.properties.$session_id).toBe("session-1");
  });
});

describe("createProductAnalytics", () => {
  it("posts to the EU host's capture endpoint", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    createProductAnalytics(config(fetchMock as unknown as FetchLike)).capture(
      PRODUCT_EVENTS.cartViewed,
      { item_count: 2, cart_value: 31.51, currency: "GBP" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${POSTHOG_HOST}/i/v0/e/`,
      expect.objectContaining({ method: "POST", keepalive: true }),
    );
    expect(POSTHOG_HOST).toBe("https://eu.i.posthog.com");
  });

  it("never throws when PostHog is unreachable", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    const analytics = createProductAnalytics(config(fetchMock as unknown as FetchLike));
    expect(() => analytics.pageview()).not.toThrow();
    await Promise.resolve();
  });

  it("identifies from the customer id, naming the anonymous id", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    createProductAnalytics(config(fetchMock as unknown as FetchLike)).identify(
      "8812345678",
    );
    expect(bodyOf(fetchMock)).toMatchObject({
      event: "$identify",
      distinct_id: "8812345678",
      properties: { $anon_distinct_id: "anon-1" },
    });
  });

  it("sends app screen views as $screen", () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")));
    createProductAnalytics({
      ...config(fetchMock as unknown as FetchLike),
      surface: "app",
    }).screen("Product");
    expect(bodyOf(fetchMock)).toMatchObject({
      event: "$screen",
      properties: { $screen_name: "Product", surface: "app" },
    });
  });
});

describe("ids", () => {
  it("reduces a Shopify gid to its number", () => {
    expect(numericId("gid://shopify/ProductVariant/53092466032952")).toBe(
      "53092466032952",
    );
  });

  it("makes v4 anonymous ids and time-ordered v7 session ids", () => {
    expect(anonymousId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    const early = sessionUuid(Date.UTC(2026, 9, 9, 10));
    const late = sessionUuid(Date.UTC(2026, 9, 9, 11));
    expect(early).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(early < late).toBe(true);
  });
});

describe("payload builders", () => {
  const line = {
    quantity: 2,
    cost: { totalAmount: { amount: "30.52", currencyCode: "GBP" } },
    merchandise: {
      id: "gid://shopify/ProductVariant/53092466032952",
      price: { amount: "17.95", currencyCode: "GBP" },
      product: {
        id: "gid://shopify/Product/10940384149816",
        handle: "magnesium-glycinate",
        title: "Magnesium Glycinate",
      },
    },
    sellingPlanAllocation: {
      sellingPlan: { name: "30 day subscription with 15% discount" },
    },
  };
  const cart = {
    totalQuantity: 3,
    cost: { subtotalAmount: { amount: "48.47", currencyCode: "GBP" } },
    lines: { nodes: [line, { ...line, sellingPlanAllocation: null }] },
  };

  it("describes an added line, including its plan", () => {
    expect(addedToCartProperties(line)).toEqual({
      product_id: "10940384149816",
      product_handle: "magnesium-glycinate",
      product_title: "Magnesium Glycinate",
      variant_id: "53092466032952",
      quantity: 2,
      // The line's cost per unit (30.52 / 2), not the variant's list price.
      price: 15.26,
      currency: "GBP",
      selling_plan: "30 day subscription with 15% discount",
    });
    expect(addedToCartProperties({ quantity: 1, merchandise: {} })).toBeNull();
    const { cost: _cost, ...withoutCost } = line;
    expect(addedToCartProperties(withoutCost)?.price).toBe(17.95);
  });

  it("totals the cart, and marks a checkout with any subscription line", () => {
    expect(cartViewedProperties(cart)).toEqual({
      item_count: 3,
      cart_value: 48.47,
      currency: "GBP",
    });
    expect(checkoutStartedProperties(cart).has_subscription).toBe(true);
    expect(
      checkoutStartedProperties({
        ...cart,
        lines: { nodes: [{ ...line, sellingPlanAllocation: null }] },
      }).has_subscription,
    ).toBe(false);
  });

  it("prices a viewed product from its lowest price", () => {
    expect(
      productViewedProperties({
        ...line.merchandise.product,
        priceRange: { minVariantPrice: { amount: "17.95", currencyCode: "GBP" } },
      }),
    ).toMatchObject({ product_id: "10940384149816", price: 17.95, currency: "GBP" });
  });
});
