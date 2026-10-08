import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";
import { listSubscriptions, type SubscriptionsEnv } from "./subscriptions";

/**
 * The portal reads with an Admin token, so these pin whose data comes back and
 * which fields of it, not just that a list appears.
 */

const env: SubscriptionsEnv = {
  SHOPIFY_SHOP_ID: "100581966136",
  SHOPIFY_API_VERSION: "2026-04",
  RECHARGE_ADMIN_TOKEN: "rc_not_real",
};

const TOKEN = "customer-access-token";
const CUSTOMER_ID = "8812345678";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** An Admin subscription, with the private fields the Admin API really returns. */
const adminSubscription = {
  id: 891037192,
  status: "active",
  product_title: "Daily Multivitamin",
  variant_title: "",
  price: "13.56",
  quantity: 1,
  order_interval_frequency: "30",
  order_interval_unit: "day",
  charge_interval_frequency: "30",
  next_charge_scheduled_at: "2026-11-05",
  presentment_currency: "GBP",
  is_skippable: true,
  is_swappable: true,
  cancelled_at: null,
  created_at: "2026-10-06T16:14:04+00:00",
  address_id: 123456,
  customer_id: 42,
  external_variant_id: { ecommerce: "53092466032952" },
  properties: [{ name: "_internal", value: "x" }],
};

const adminCharge = {
  id: 1946419139,
  status: "queued",
  scheduled_at: "2026-11-05",
  subtotal_price: "13.56",
  total_price: "17.51",
  currency: "GBP",
  line_items: [
    {
      purchase_item_id: 891037192,
      title: "Daily Multivitamin",
      variant_title: null,
      quantity: 1,
      total_price: "13.56",
      sku: "DH-MULTI",
    },
  ],
  shipping_lines: [{ title: "Standard delivery", price: "3.95", code: "STD" }],
  billing_address: { address1: "1 Private Road", zip: "AB1 2CD" },
  shipping_address: { address1: "1 Private Road", zip: "AB1 2CD" },
  payment_processor: "shopify_payments",
  customer: { email: "sam@formulate.example", hash: "secret" },
  note: "leave by the door",
};

const stubUpstream = (
  options: {
    customer?: Response;
    rechargeCustomers?: unknown[];
    rechargeDown?: boolean;
  } = {},
) => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://shopify.com/")) {
        return Promise.resolve(
          options.customer ??
            jsonResponse({
              data: { customer: { id: `gid://shopify/Customer/${CUSTOMER_ID}` } },
            }),
        );
      }
      if (options.rechargeDown) return Promise.resolve(new Response("", { status: 503 }));
      if (url.includes("/customers?")) {
        return Promise.resolve(
          jsonResponse({ customers: options.rechargeCustomers ?? [{ id: 42 }] }),
        );
      }
      if (url.includes("/subscriptions?")) {
        return Promise.resolve(jsonResponse({ subscriptions: [adminSubscription] }));
      }
      if (url.includes("/charges?")) {
        return Promise.resolve(jsonResponse({ charges: [adminCharge] }));
      }
      throw new Error(`unexpected upstream call: ${url}`);
    }),
  );
  return calls;
};

const request = (body: unknown = {}, token: string | null = TOKEN) =>
  new Request("https://api.example/account/subscriptions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("⚠️ whose subscriptions", () => {
  it("reads nothing without a token", async () => {
    const calls = stubUpstream();
    const result = await listSubscriptions(env, request({}, null));
    expect(result).toEqual({ status: 401, body: { ok: false, reason: "unauthorized" } });
    expect(calls).toEqual([]);
  });

  it("stops at Shopify when the token isn't a live sign-in", async () => {
    const calls = stubUpstream({ customer: new Response("", { status: 401 }) });
    const result = await listSubscriptions(env, request());
    expect(result.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("looks up only the customer Shopify names, whatever the body says", async () => {
    const calls = stubUpstream();
    await listSubscriptions(
      env,
      request({ customer_id: "1", customerId: "1", external_customer_id: "1" }),
    );
    expect(calls).toContain(
      `https://api.rechargeapps.com/customers?external_customer_id=${CUSTOMER_ID}`,
    );
    expect(calls.filter((url) => url.includes("customer_id=1"))).toEqual([]);
    expect(calls.some((url) => url.includes("/subscriptions?customer_id=42&"))).toBe(
      true,
    );
    expect(calls.some((url) => url.includes("/charges?customer_id=42&"))).toBe(true);
  });

  it("answers 503 without the Recharge token, without calling anyone", async () => {
    const calls = stubUpstream();
    const result = await listSubscriptions(
      { ...env, RECHARGE_ADMIN_TOKEN: undefined },
      request(),
    );
    expect(result).toEqual({
      status: 503,
      body: { ok: false, reason: "not-configured" },
    });
    expect(calls).toEqual([]);
  });
});

describe("⚠️ which fields", () => {
  it("returns only what the pages show: no addresses, payment, notes or properties", async () => {
    stubUpstream();
    const result = await listSubscriptions(env, request());
    expect(result.status).toBe(200);
    const text = JSON.stringify(result.body);
    for (const leak of [
      "Private Road",
      "AB1 2CD",
      "shopify_payments",
      "sam@formulate.example",
      "secret",
      "leave by the door",
      "_internal",
      "address_id",
      "DH-MULTI",
      "STD",
      "53092466032952",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("keeps the shape @formulate/recharge's display helpers read", async () => {
    stubUpstream();
    const result = await listSubscriptions(env, request());
    expect(result.body).toEqual({
      ok: true,
      subscriptions: [
        {
          id: 891037192,
          status: "active",
          product_title: "Daily Multivitamin",
          variant_title: "",
          price: "13.56",
          quantity: 1,
          order_interval_frequency: "30",
          order_interval_unit: "day",
          next_charge_scheduled_at: "2026-11-05",
          presentment_currency: "GBP",
          is_skippable: true,
          is_swappable: true,
          cancelled_at: null,
          created_at: "2026-10-06T16:14:04+00:00",
        },
      ],
      upcoming: [
        {
          id: 1946419139,
          status: "queued",
          scheduled_at: "2026-11-05",
          subtotal_price: "13.56",
          total_price: "17.51",
          currency: "GBP",
          line_items: [
            {
              purchase_item_id: 891037192,
              title: "Daily Multivitamin",
              variant_title: null,
              quantity: 1,
              total_price: "13.56",
            },
          ],
          shipping_lines: [{ title: "Standard delivery", price: "3.95" }],
        },
      ],
    });
  });
});

describe("edge cases", () => {
  it("answers empty lists for someone who never subscribed", async () => {
    const calls = stubUpstream({ rechargeCustomers: [] });
    const result = await listSubscriptions(env, request());
    expect(result).toEqual({
      status: 200,
      body: { ok: true, subscriptions: [], upcoming: [] },
    });
    expect(calls).toHaveLength(2);
  });

  it("says unavailable, not empty, when Recharge can't be read", async () => {
    stubUpstream({ rechargeDown: true });
    const result = await listSubscriptions(env, request());
    expect(result).toEqual({ status: 502, body: { ok: false, reason: "unavailable" } });
  });

  it("is routed by the Worker, with no-store and no CORS headers", async () => {
    stubUpstream();
    const workerEnv = {
      ...env,
      SHOPIFY_STORE_DOMAIN: "shop.example",
      KLAVIYO_PRIVATE_KEY: "pk_not_real",
      KLAVIYO_LIST_ID: "XPJ8ic",
      RATE_LIMITER: {
        idFromName: (name: string) => name,
        get: () => ({ limit: () => Promise.resolve({ success: true }) }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Env is supplied by the pool
    const response = await worker.fetch(request(), workerEnv as any);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
