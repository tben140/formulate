import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteAccount,
  londonToday,
  previewDeletion,
  type DeletionEnv,
} from "./account-deletion";
import worker from "./index";

/**
 * Account deletion holds Admin tokens for Shopify and Recharge, so these tests
 * pin who can be affected and in what order, not just the happy path.
 */

const env: DeletionEnv = {
  SHOPIFY_SHOP_ID: "100581966136",
  SHOPIFY_STORE_DOMAIN: "shop.example",
  SHOPIFY_API_VERSION: "2026-04",
  SHOPIFY_ADMIN_TOKEN: "shpat_not_real",
  RECHARGE_ADMIN_TOKEN: "rc_not_real",
  KLAVIYO_DELETION_KEY: "pk_not_real",
};

const TOKEN = "customer-access-token";
const CUSTOMER_ID = "8812345678";

const subscription = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  product_title: `Product ${id}`,
  variant_title: "",
  next_charge_scheduled_at: "2026-11-05",
  order_interval_frequency: "30",
  charge_interval_frequency: "30",
  price: "13.56",
  ...overrides,
});

interface Upstream {
  customer?: Response;
  rechargeCustomers?: unknown[];
  subscriptions?: unknown[];
  charges?: unknown[];
  cancel?: number;
  klaviyo?: number;
  erasure?: unknown;
  rechargeDown?: boolean;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Routes each upstream call to a canned answer, and records them in order. */
const stubUpstream = (upstream: Upstream = {}) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith("https://shopify.com/")) {
        return Promise.resolve(
          upstream.customer ??
            jsonResponse({
              data: {
                customer: {
                  id: `gid://shopify/Customer/${CUSTOMER_ID}`,
                  emailAddress: { emailAddress: "sam@formulate.example" },
                },
              },
            }),
        );
      }
      if (upstream.rechargeDown && url.startsWith("https://api.rechargeapps.com/")) {
        return Promise.resolve(new Response("down", { status: 503 }));
      }
      if (url.includes("/customers?")) {
        return Promise.resolve(
          jsonResponse({ customers: upstream.rechargeCustomers ?? [{ id: 42 }] }),
        );
      }
      if (url.includes("/subscriptions?")) {
        return Promise.resolve(
          jsonResponse({ subscriptions: upstream.subscriptions ?? [] }),
        );
      }
      if (url.includes("/charges?")) {
        return Promise.resolve(jsonResponse({ charges: upstream.charges ?? [] }));
      }
      if (url.endsWith("/cancel")) {
        return Promise.resolve(jsonResponse({}, upstream.cancel ?? 200));
      }
      if (url.startsWith("https://a.klaviyo.com/")) {
        return Promise.resolve(new Response(null, { status: upstream.klaviyo ?? 202 }));
      }
      if (url.includes("/admin/api/")) {
        return Promise.resolve(
          jsonResponse(
            upstream.erasure ?? {
              data: {
                customerRequestDataErasure: {
                  customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
                  userErrors: [],
                },
              },
            },
          ),
        );
      }
      throw new Error(`unexpected upstream call: ${url}`);
    }),
  );
  return calls;
};

const request = (body: unknown = {}, token: string | null = TOKEN) =>
  new Request("https://api.example/account/deletion", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  });

const confirmed = (extra: Record<string, unknown> = {}) => {
  const body = { confirm: "delete", ...extra };
  return [request(body), JSON.stringify(body)] as const;
};

const kinds = (calls: { url: string }[]) =>
  calls.map(({ url }) =>
    url.startsWith("https://shopify.com/")
      ? "verify"
      : url.includes("/customers?")
        ? "recharge-customer"
        : url.includes("/subscriptions?")
          ? "recharge-subscriptions"
          : url.includes("/charges?")
            ? "recharge-charges"
            : url.endsWith("/cancel")
              ? "cancel"
              : url.startsWith("https://a.klaviyo.com/")
                ? "klaviyo"
                : "erasure",
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("⚠️ who can be affected", () => {
  it("does nothing at all without a token", async () => {
    const calls = stubUpstream();
    const result = await deleteAccount(
      env,
      request({ confirm: "delete" }, null),
      '{"confirm":"delete"}',
    );
    expect(result).toEqual({ status: 401, body: { ok: false, reason: "unauthorized" } });
    expect(calls).toEqual([]);
  });

  it("stops at Shopify when the token isn't a live sign-in", async () => {
    const calls = stubUpstream({ customer: new Response("", { status: 401 }) });
    const result = await deleteAccount(env, ...confirmed());
    expect(result.status).toBe(401);
    expect(kinds(calls)).toEqual(["verify"]);
  });

  it("sends the token to Shopify bare, as the Customer Account API expects", async () => {
    const calls = stubUpstream();
    await previewDeletion(env, request());
    expect(calls[0]?.url).toBe(
      "https://shopify.com/100581966136/account/customer/api/2026-04/graphql",
    );
    expect(new Headers(calls[0]?.init?.headers).get("Authorization")).toBe(TOKEN);
  });

  it("ignores any customer, email or subscription named in the request", async () => {
    const calls = stubUpstream({ subscriptions: [subscription(7)] });
    const [req, raw] = confirmed({
      customerId: "1",
      customer_id: "1",
      email: "someone-else@formulate.example",
      subscriptions: [999],
    });
    const result = await deleteAccount(env, req, raw);
    expect(result.status).toBe(200);

    const urls = calls.map((call) => call.url);
    expect(urls).toContain(
      `https://api.rechargeapps.com/customers?external_customer_id=${CUSTOMER_ID}`,
    );
    expect(urls.some((url) => url.includes("/subscriptions/999/"))).toBe(false);
    expect(urls).toContain("https://api.rechargeapps.com/subscriptions/7/cancel");

    const klaviyo = calls.find((call) => call.url.startsWith("https://a.klaviyo.com/"));
    expect(String(klaviyo?.init?.body)).toContain("sam@formulate.example");
    expect(String(klaviyo?.init?.body)).not.toContain("someone-else");

    const erasure = calls.find((call) => call.url.includes("/admin/api/"));
    expect(JSON.parse(String(erasure?.init?.body)).variables).toEqual({
      customerId: `gid://shopify/Customer/${CUSTOMER_ID}`,
    });
  });

  it("needs an explicit confirmation before deleting anything", async () => {
    const calls = stubUpstream();
    for (const body of [{}, { confirm: true }, { confirm: "yes" }]) {
      const result = await deleteAccount(env, request(body), JSON.stringify(body));
      expect(result).toEqual({
        status: 400,
        body: { ok: false, reason: "not-confirmed" },
      });
    }
    expect(calls).toEqual([]);
  });

  it("answers 503 until all three keys are set, without calling anyone", async () => {
    const calls = stubUpstream();
    for (const missing of [
      "SHOPIFY_ADMIN_TOKEN",
      "RECHARGE_ADMIN_TOKEN",
      "KLAVIYO_DELETION_KEY",
    ]) {
      const partial = { ...env, [missing]: undefined };
      const notConfigured = {
        status: 503,
        body: { ok: false, reason: "not-configured" },
      };
      expect(await previewDeletion(partial, request())).toEqual(notConfigured);
      expect(await deleteAccount(partial, ...confirmed())).toEqual(notConfigured);
    }
    expect(calls).toEqual([]);
  });
});

describe("⚠️ order, and stopping at the first failure", () => {
  it("cancels subscriptions, then deletes marketing data, then requests erasure", async () => {
    const calls = stubUpstream({ subscriptions: [subscription(7), subscription(8)] });
    const result = await deleteAccount(env, ...confirmed());
    expect(result).toEqual({ status: 200, body: { ok: true, cancelled: 2 } });
    expect(kinds(calls)).toEqual([
      "verify",
      "recharge-customer",
      "recharge-subscriptions",
      "recharge-charges",
      "cancel",
      "cancel",
      "klaviyo",
      "erasure",
    ]);
    const cancel = calls.find((call) => call.url.endsWith("/cancel"));
    expect(JSON.parse(String(cancel?.init?.body))).toMatchObject({
      cancellation_reason: "Account deleted",
      send_email: false,
    });
  });

  it("never requests erasure while a subscription is still active", async () => {
    const calls = stubUpstream({ subscriptions: [subscription(7)], cancel: 500 });
    const result = await deleteAccount(env, ...confirmed());
    expect(result).toEqual({ status: 502, body: { ok: false, reason: "subscriptions" } });
    expect(kinds(calls)).not.toContain("klaviyo");
    expect(kinds(calls)).not.toContain("erasure");
  });

  it("stops before erasure when Recharge can't be read", async () => {
    const calls = stubUpstream({ rechargeDown: true });
    const result = await deleteAccount(env, ...confirmed());
    expect(result.body).toEqual({ ok: false, reason: "subscriptions" });
    expect(kinds(calls)).not.toContain("erasure");
  });

  it("stops before erasure when Klaviyo refuses", async () => {
    const calls = stubUpstream({ klaviyo: 403 });
    const result = await deleteAccount(env, ...confirmed());
    expect(result.body).toEqual({ ok: false, reason: "marketing" });
    expect(kinds(calls)).not.toContain("erasure");
  });

  it("reports Shopify's user errors as a failure", async () => {
    stubUpstream({
      erasure: {
        data: {
          customerRequestDataErasure: {
            customerId: null,
            userErrors: [{ code: "DOES_NOT_EXIST" }],
          },
        },
      },
    });
    const result = await deleteAccount(env, ...confirmed());
    expect(result.body).toEqual({ ok: false, reason: "erasure" });
  });

  it("goes straight to erasure for someone who never subscribed", async () => {
    const calls = stubUpstream({ rechargeCustomers: [] });
    const result = await deleteAccount(env, ...confirmed());
    expect(result).toEqual({ status: 200, body: { ok: true, cancelled: 0 } });
    expect(kinds(calls)).toEqual(["verify", "recharge-customer", "klaviyo", "erasure"]);
  });
});

describe("the confirmation screen's preview", () => {
  it("lists what would be cancelled: titles and dates, no ids or prices", async () => {
    stubUpstream({
      subscriptions: [
        subscription(7, { product_title: "Daily Multivitamin" }),
        subscription(8, {
          product_title: "Magnesium Glycinate",
          variant_title: "200 mg",
          charge_interval_frequency: "90",
        }),
      ],
    });
    const result = await previewDeletion(env, request());
    expect(result).toEqual({
      status: 200,
      body: {
        ok: true,
        subscriptions: [
          {
            title: "Daily Multivitamin",
            variant: null,
            nextDelivery: "2026-11-05",
            prepaid: false,
          },
          {
            title: "Magnesium Glycinate",
            variant: "200 mg",
            nextDelivery: "2026-11-05",
            prepaid: true,
          },
        ],
        chargeToday: false,
      },
    });
    expect(JSON.stringify(result.body)).not.toMatch(/13\.56|"id"/);
  });

  it("warns when a charge is due today, by London's calendar", async () => {
    // 23:30 UTC on 6 October is already 7 October in London (BST).
    const now = new Date("2026-10-06T23:30:00Z");
    expect(londonToday(now)).toBe("2026-10-07");
    stubUpstream({ charges: [{ scheduled_at: "2026-10-07T00:00:00" }] });
    const result = await previewDeletion(env, request(), now);
    expect(result.body).toMatchObject({ ok: true, chargeToday: true });
  });
});

describe("through the Worker", () => {
  const workerEnv = {
    ...env,
    KLAVIYO_PRIVATE_KEY: "pk_not_real",
    KLAVIYO_LIST_ID: "XPJ8ic",
    RATE_LIMITER: {
      idFromName: (name: string) => name,
      get: () => ({ limit: () => Promise.resolve({ success: true }) }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Env is supplied by the pool
  const run = (req: Request) => worker.fetch(req, workerEnv as any);

  it("routes both paths, with no-store and no CORS headers", async () => {
    stubUpstream();
    const preview = await run(
      new Request("https://api.example/account/deletion/preview", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: TOKEN },
        body: "{}",
      }),
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("no-store");
    expect(preview.headers.get("access-control-allow-origin")).toBeNull();

    const deletion = await run(request({ confirm: "delete" }));
    expect(deletion.status).toBe(200);
    expect(await deletion.json()).toEqual({ ok: true, cancelled: 0 });
  });

  it("never returns an upstream error body", async () => {
    stubUpstream({ cancel: 500, subscriptions: [subscription(7)] });
    const response = await run(request({ confirm: "delete" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, reason: "subscriptions" });
  });
});
