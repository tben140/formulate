import { afterEach, describe, expect, it, vi } from "vitest";

import {
  actOnSubscription,
  addMonths,
  isAllowedDate,
  parseAction,
  type ActionsEnv,
} from "./subscription-actions";

/**
 * The portal writes with an Admin token, so these pin that only the caller's
 * own subscription changes, and only in the ways the portal allows.
 */

const env: ActionsEnv = {
  SHOPIFY_SHOP_ID: "100581966136",
  SHOPIFY_API_VERSION: "2026-04",
  RECHARGE_ADMIN_TOKEN: "rc_not_real",
};

const TOKEN = "customer-access-token";
const CUSTOMER_ID = "8812345678";
const RECHARGE_CUSTOMER = 42;
const SUB = 891037192;
const NOW = new Date("2026-10-20T12:00:00Z");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: SUB,
  customer_id: RECHARGE_CUSTOMER,
  status: "active",
  is_skippable: true,
  next_charge_scheduled_at: "2026-11-05",
  external_product_id: { ecommerce: "9001" },
  ...overrides,
});

type Call = { url: string; method: string; body: unknown };

const stubUpstream = (
  options: {
    customer?: Response;
    sub?: Record<string, unknown> | "missing";
    charges?: unknown[];
    charge?: Record<string, unknown> | "missing";
    plans?: unknown[];
    writeFails?: boolean;
  } = {},
) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? "GET";
      calls.push({
        url,
        method,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      });
      if (url.startsWith("https://shopify.com/")) {
        return Promise.resolve(
          options.customer ??
            jsonResponse({
              data: { customer: { id: `gid://shopify/Customer/${CUSTOMER_ID}` } },
            }),
        );
      }
      if (method !== "GET" && url.startsWith("https://api.rechargeapps.com/")) {
        return Promise.resolve(
          options.writeFails ? new Response("", { status: 422 }) : jsonResponse({}),
        );
      }
      if (url.includes("/customers?")) {
        return Promise.resolve(jsonResponse({ customers: [{ id: RECHARGE_CUSTOMER }] }));
      }
      if (url.includes(`/subscriptions/`)) {
        const sub = options.sub ?? subscription();
        return Promise.resolve(
          sub === "missing"
            ? new Response("", { status: 404 })
            : jsonResponse({ subscription: sub }),
        );
      }
      if (url.includes("/charges?")) {
        return Promise.resolve(
          jsonResponse({
            charges: options.charges ?? [
              {
                id: 555,
                customer_id: RECHARGE_CUSTOMER,
                line_items: [{ purchase_item_id: SUB }],
              },
            ],
          }),
        );
      }
      if (url.includes("/charges/")) {
        const charge = options.charge ?? { id: 555, customer: { id: RECHARGE_CUSTOMER } };
        return Promise.resolve(
          charge === "missing"
            ? new Response("", { status: 404 })
            : jsonResponse({ charge }),
        );
      }
      if (url.includes("/plans?")) {
        return Promise.resolve(
          jsonResponse({
            plans: options.plans ?? [
              {
                type: "subscription",
                subscription_preferences: {
                  order_interval_frequency: 30,
                  interval_unit: "day",
                },
              },
              {
                type: "subscription",
                subscription_preferences: {
                  order_interval_frequency: 60,
                  interval_unit: "day",
                },
              },
              { type: "onetime", subscription_preferences: {} },
            ],
          }),
        );
      }
      throw new Error(`unexpected upstream call: ${method} ${url}`);
    }),
  );
  return calls;
};

const request = (token: string | null = TOKEN) =>
  new Request("https://api.example/account/subscriptions/action", {
    method: "POST",
    headers: token ? { Authorization: token } : {},
  });

const act = (body: unknown, token: string | null = TOKEN) =>
  actOnSubscription(env, request(token), JSON.stringify(body), NOW);

// Shopify's sign-in check is a POST too; only Recharge writes count.
const writes = (calls: Call[]) =>
  calls.filter(
    (c) => c.method !== "GET" && c.url.startsWith("https://api.rechargeapps.com/"),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("⚠️ whose subscription", () => {
  it("does nothing without a token", async () => {
    const calls = stubUpstream();
    expect(await act({ subscriptionId: SUB, action: "skip" }, null)).toEqual({
      status: 401,
      body: { ok: false, reason: "unauthorized" },
    });
    expect(calls).toEqual([]);
  });

  it("stops at Shopify when the token isn't a live sign-in", async () => {
    const calls = stubUpstream({ customer: new Response("", { status: 401 }) });
    expect((await act({ subscriptionId: SUB, action: "skip" })).status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("won't touch someone else's subscription, and says it doesn't exist", async () => {
    const calls = stubUpstream({ sub: subscription({ customer_id: 999 }) });
    const result = await act({ subscriptionId: SUB, action: "cancel", reason: "other" });
    expect(result).toEqual({ status: 404, body: { ok: false, reason: "not-found" } });
    expect(writes(calls)).toEqual([]);
  });

  it("answers a missing subscription the same way", async () => {
    stubUpstream({ sub: "missing" });
    expect(await act({ subscriptionId: SUB, action: "skip" })).toEqual({
      status: 404,
      body: { ok: false, reason: "not-found" },
    });
  });

  it("won't undo a skip on someone else's charge", async () => {
    const calls = stubUpstream({ charge: { id: 555, customer: { id: 999 } } });
    expect(
      (await act({ subscriptionId: SUB, action: "unskip", chargeId: 555 })).status,
    ).toBe(404);
    expect(writes(calls)).toEqual([]);
  });

  it("checks the request before asking anyone", async () => {
    const calls = stubUpstream();
    expect((await act({ subscriptionId: SUB, action: "delete" })).status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe("the per-customer limit", () => {
  it("is keyed by the verified customer, and stops before Recharge", async () => {
    const calls = stubUpstream();
    const keys: string[] = [];
    const limited: ActionsEnv = {
      ...env,
      RATE_LIMITER: {
        idFromName: (name: string) => {
          keys.push(name);
          return name;
        },
        get: () => ({ limit: () => Promise.resolve({ success: false }) }),
      } as unknown as ActionsEnv["RATE_LIMITER"],
    };
    const result = await actOnSubscription(
      limited,
      request(),
      JSON.stringify({ subscriptionId: SUB, action: "skip" }),
      NOW,
    );
    expect(result).toEqual({ status: 429, body: { ok: false, reason: "rate-limited" } });
    expect(keys).toEqual([`customer:${CUSTOMER_ID}`]);
    expect(
      calls.filter((c) => c.url.startsWith("https://api.rechargeapps.com/")),
    ).toEqual([]);
  });
});

describe("the actions", () => {
  it("skips the next delivery of just this subscription, and offers the charge for undo", async () => {
    const calls = stubUpstream();
    expect(await act({ subscriptionId: SUB, action: "skip" })).toEqual({
      status: 200,
      body: { ok: true, skippedChargeId: 555 },
    });
    expect(writes(calls)).toEqual([
      {
        url: "https://api.rechargeapps.com/charges/555/skip",
        method: "POST",
        body: { purchase_item_ids: [SUB] },
      },
    ]);
  });

  it("won't skip a subscription Recharge marks unskippable", async () => {
    const calls = stubUpstream({ sub: subscription({ is_skippable: false }) });
    expect((await act({ subscriptionId: SUB, action: "skip" })).status).toBe(409);
    expect(writes(calls)).toEqual([]);
  });

  it("undoes a skip", async () => {
    const calls = stubUpstream();
    expect(
      (await act({ subscriptionId: SUB, action: "unskip", chargeId: 555 })).status,
    ).toBe(200);
    expect(writes(calls)[0]).toMatchObject({
      url: "https://api.rechargeapps.com/charges/555/unskip",
      body: { purchase_item_ids: [SUB] },
    });
  });

  it("moves the next delivery to a chosen date", async () => {
    const calls = stubUpstream();
    expect(
      (await act({ subscriptionId: SUB, action: "reschedule", date: "2026-11-20" }))
        .status,
    ).toBe(200);
    expect(writes(calls)[0]).toMatchObject({
      url: `https://api.rechargeapps.com/subscriptions/${SUB}/set_next_charge_date`,
      body: { date: "2026-11-20" },
    });
  });

  it("pauses by moving the next delivery out whole months", async () => {
    const calls = stubUpstream();
    expect((await act({ subscriptionId: SUB, action: "pause", months: 2 })).status).toBe(
      200,
    );
    expect(writes(calls)[0]?.body).toEqual({ date: "2027-01-05" });
  });

  it("changes the quantity, up to the cart's limit of 6", async () => {
    const calls = stubUpstream();
    expect(
      (await act({ subscriptionId: SUB, action: "quantity", quantity: 3 })).status,
    ).toBe(200);
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", body: { quantity: 3 } });
    expect(
      (await act({ subscriptionId: SUB, action: "quantity", quantity: 7 })).status,
    ).toBe(400);
  });

  it("changes frequency only to one the product's plans offer", async () => {
    let calls = stubUpstream();
    expect(
      (
        await act({
          subscriptionId: SUB,
          action: "frequency",
          frequency: 60,
          unit: "day",
        })
      ).status,
    ).toBe(200);
    expect(writes(calls)[0]?.body).toEqual({
      order_interval_frequency: 60,
      charge_interval_frequency: 60,
      order_interval_unit: "day",
    });
    calls = stubUpstream();
    expect(
      (
        await act({
          subscriptionId: SUB,
          action: "frequency",
          frequency: 45,
          unit: "day",
        })
      ).status,
    ).toBe(400);
    expect(writes(calls)).toEqual([]);
  });

  it("won't change the frequency of a prepaid subscription", async () => {
    const calls = stubUpstream({
      sub: subscription({ order_interval_frequency: 30, charge_interval_frequency: 90 }),
    });
    expect(
      (
        await act({
          subscriptionId: SUB,
          action: "frequency",
          frequency: 60,
          unit: "day",
        })
      ).status,
    ).toBe(409);
    expect(writes(calls)).toEqual([]);
  });

  it("cancels with one of the portal's reasons and an optional comment", async () => {
    const calls = stubUpstream();
    const result = await act({
      subscriptionId: SUB,
      action: "cancel",
      reason: "too-much-product",
      comment: "  Stocked up  ",
    });
    expect(result.status).toBe(200);
    expect(writes(calls)[0]).toMatchObject({
      url: `https://api.rechargeapps.com/subscriptions/${SUB}/cancel`,
      body: {
        cancellation_reason: "too-much-product",
        cancellation_reason_comments: "Stocked up",
      },
    });
  });

  it("reactivates only a cancelled subscription", async () => {
    let calls = stubUpstream({ sub: subscription({ status: "cancelled" }) });
    expect((await act({ subscriptionId: SUB, action: "reactivate" })).status).toBe(200);
    expect(writes(calls)[0]?.url).toBe(
      `https://api.rechargeapps.com/subscriptions/${SUB}/activate`,
    );
    calls = stubUpstream();
    expect((await act({ subscriptionId: SUB, action: "reactivate" })).status).toBe(409);
    expect(writes(calls)).toEqual([]);
  });

  it("changes nothing on a cancelled subscription", async () => {
    const calls = stubUpstream({ sub: subscription({ status: "cancelled" }) });
    expect((await act({ subscriptionId: SUB, action: "pause", months: 1 })).status).toBe(
      409,
    );
    expect(writes(calls)).toEqual([]);
  });

  it("reports Recharge refusing a change", async () => {
    stubUpstream({ writeFails: true });
    expect(await act({ subscriptionId: SUB, action: "quantity", quantity: 2 })).toEqual({
      status: 502,
      body: { ok: false, reason: "unavailable" },
    });
  });
});

describe("the rules", () => {
  it("accepts only real dates from tomorrow to a year ahead", () => {
    expect(isAllowedDate("2026-10-21", NOW)).toBe(true);
    expect(isAllowedDate("2027-10-20", NOW)).toBe(true);
    expect(isAllowedDate("2026-10-20", NOW)).toBe(false);
    expect(isAllowedDate("2027-10-21", NOW)).toBe(false);
    expect(isAllowedDate("2026-02-30", NOW)).toBe(false);
    expect(isAllowedDate("20/11/2026", NOW)).toBe(false);
  });

  it("adds months without spilling into the next month", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-11-05", 3)).toBe("2027-02-05");
  });

  it("takes nothing but the known fields, in range", () => {
    expect(parseAction("[]")).toBeNull();
    expect(parseAction("not json")).toBeNull();
    expect(
      parseAction(JSON.stringify({ subscriptionId: "1", action: "skip" })),
    ).toBeNull();
    expect(
      parseAction(JSON.stringify({ subscriptionId: 1, action: "pause", months: 4 })),
    ).toBeNull();
    expect(
      parseAction(
        JSON.stringify({ subscriptionId: 1, action: "cancel", reason: "because" }),
      ),
    ).toBeNull();
    expect(
      parseAction(
        JSON.stringify({
          subscriptionId: 1,
          action: "cancel",
          reason: "other",
          comment: "x".repeat(301),
        }),
      ),
    ).toBeNull();
    expect(
      parseAction(
        JSON.stringify({ subscriptionId: 1, action: "skip", customer_id: 999 }),
      ),
    ).toEqual({ subscriptionId: 1, action: { action: "skip" } });
  });
});
