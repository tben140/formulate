import { orderEventUuid } from "@formulate/analytics";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

const SECRET = "shpss_not_a_real_secret";

const sign = async (body: string, secret = SECRET) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
};

const order = JSON.stringify({
  id: 6500000000001,
  created_at: "2026-10-28T19:40:00+00:00",
  currency: "GBP",
  total_price: "39.85",
  note_attributes: [
    { name: "_posthog_id", value: "web-visitor-id" },
    { name: "_surface", value: "web" },
  ],
  line_items: [{ quantity: 2 }, { quantity: 1 }],
});

/** The order objects the webhook reached, by order id, with what they got. */
const backups = new Map<string, { schedule: ReturnType<typeof vi.fn> }>();
const backup = (orderId: string) => {
  const existing = backups.get(orderId);
  if (existing) return existing;
  const created = { schedule: vi.fn(() => Promise.resolve("scheduled")) };
  backups.set(orderId, created);
  return created;
};

const env = (overrides = {}) => ({
  KLAVIYO_PRIVATE_KEY: "pk",
  KLAVIYO_LIST_ID: "list",
  SHOPIFY_WEBHOOK_SECRET: SECRET,
  POSTHOG_KEY: "phc_test",
  RATE_LIMITER: {
    idFromName: (name: string) => name,
    // The webhook must never reach the shoppers' limiter.
    get: () => ({ limit: () => Promise.reject(new Error("rate limiter used")) }),
  },
  ORDER_BACKUP: {
    idFromName: (name: string) => name,
    get: (id: string) => backup(id),
  },
  ...overrides,
});

const webhook = async (body: string, headers: Record<string, string> = {}) =>
  new Request("https://api.example/webhooks/orders-create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-topic": "orders/create",
      "x-shopify-hmac-sha256": await sign(body),
      ...headers,
    },
    body,
  });

const call = (request: Request, e = env()) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the stubs stand in for Cloudflare bindings
  worker.fetch(request, e as any);

afterEach(() => {
  vi.unstubAllGlobals();
  backups.clear();
});

describe("orders/create webhook", () => {
  it("hands the order's event to its backup object, not to PostHog", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await call(await webhook(order));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const scheduled = backup("6500000000001").schedule.mock.calls[0]?.[0];
    expect(scheduled).toMatchObject({
      event: "order_completed",
      uuid: orderEventUuid("6500000000001"),
      distinct_id: "web-visitor-id",
      timestamp: "2026-10-28T19:40:00.000Z",
      properties: { order_value: 39.85, item_count: 3, surface: "web" },
    });
  });

  it("asks Shopify to retry when the backup can't be stored", async () => {
    vi.stubGlobal("fetch", vi.fn());
    backup("6500000000001").schedule.mockRejectedValueOnce(new Error("storage"));
    expect((await call(await webhook(order))).status).toBe(503);
  });

  it("rejects a wrong signature before parsing, and sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const forged = await webhook(order, {
      "x-shopify-hmac-sha256": await sign(order, "wrong"),
    });
    expect((await call(forged)).status).toBe(401);
    const garbage = await webhook(order, { "x-shopify-hmac-sha256": "not base64!" });
    expect((await call(garbage)).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a signature over a different body", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const request = new Request("https://api.example/webhooks/orders-create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "orders/create",
        "x-shopify-hmac-sha256": await sign(order),
      },
      body: order.replace("39.85", "0.01"),
    });
    expect((await call(request)).status).toBe(401);
  });

  it("accepts an order without an analytics id, and sends nothing (no consent)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const untagged = JSON.stringify({ ...JSON.parse(order), note_attributes: [] });
    expect((await call(await webhook(untagged))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(backups.size).toBe(0);
  });

  it("asks Shopify to retry a consented order until the PostHog key is set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await call(await webhook(order), env({ POSTHOG_KEY: undefined }))).status,
    ).toBe(503);
    const untagged = JSON.stringify({ ...JSON.parse(order), note_attributes: [] });
    expect(
      (await call(await webhook(untagged), env({ POSTHOG_KEY: undefined }))).status,
    ).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a body over the limit, declared or streamed, before checking it", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const big = "x".repeat(256 * 1024 + 1);
    expect((await call(await webhook(big))).status).toBe(413);
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 5) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const chunked = new Request("https://api.example/webhooks/orders-create", {
      method: "POST",
      headers: { "x-shopify-topic": "orders/create", "x-shopify-hmac-sha256": "x" },
      body: stream,
      // @ts-expect-error -- needed for a streamed request body in Node
      duplex: "half",
    });
    expect((await call(chunked)).status).toBe(413);
  });

  it("refuses everything until the secret is set, and other topics", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(
      (await call(await webhook(order), env({ SHOPIFY_WEBHOOK_SECRET: undefined })))
        .status,
    ).toBe(503);
    expect(
      (await call(await webhook(order, { "x-shopify-topic": "orders/paid" }))).status,
    ).toBe(400);
  });
});
