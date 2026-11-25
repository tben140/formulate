import { afterEach, describe, expect, it, vi } from "vitest";

import { checkConfirmToken, confirmToken, verifyProxyRequest } from "./app-proxy";
import worker from "./index";
import { resetAdminTokenCache } from "./shopify-admin";

/**
 * The theme's account deletion through Shopify's app proxy. The customer id
 * is whatever Shopify signed, so these tests pin the signature, the shop, the
 * time and the confirmation token before anything else.
 */

const SECRET = "app-proxy-secret-not-real";
const SHOP = "shop.example";
const CUSTOMER_ID = "8812345678";
const NOW = Date.parse("2026-11-25T12:00:00Z");

const env = {
  SHOPIFY_SHOP_ID: "100581966136",
  SHOPIFY_STORE_DOMAIN: SHOP,
  SHOPIFY_API_VERSION: "2026-04",
  SHOPIFY_CLIENT_ID: "client-id-not-real",
  SHOPIFY_CLIENT_SECRET: "shpss_not_real",
  RECHARGE_ADMIN_TOKEN: "rc_not_real",
  KLAVIYO_DELETION_KEY: "pk_not_real",
  SHOPIFY_APP_PROXY_SECRET: SECRET,
  KLAVIYO_PRIVATE_KEY: "pk_not_real",
  KLAVIYO_LIST_ID: "XPJ8ic",
};

/** Signs as Shopify does: sorted `name=value`, no separator, HMAC-SHA256 hex. */
const signed = async (path: string, params: Record<string, string>, secret = SECRET) => {
  const message = Object.keys(params)
    .sort()
    .map((name) => `${name}=${params[name]}`)
    .join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const signature = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new URL(
    `https://api.example${path}?${new URLSearchParams({ ...params, signature })}`,
  );
};

const proxyParams = (overrides: Record<string, string> = {}) => ({
  shop: SHOP,
  logged_in_customer_id: CUSTOMER_ID,
  path_prefix: "/apps/double-helix",
  timestamp: String(Math.floor(Date.now() / 1000)),
  ...overrides,
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const stubUpstream = (subscriptions: unknown[] = []) => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/admin/oauth/access_token")) {
        return Promise.resolve(
          jsonResponse({ access_token: "minted", scope: "x", expires_in: 86399 }),
        );
      }
      if (url.includes("/admin/api/")) {
        const body = String(init?.body);
        return Promise.resolve(
          jsonResponse(
            body.includes("customerRequestDataErasure")
              ? { data: { customerRequestDataErasure: { userErrors: [] } } }
              : {
                  data: {
                    customer: {
                      id: `gid://shopify/Customer/${CUSTOMER_ID}`,
                      defaultEmailAddress: { emailAddress: "sam@formulate.example" },
                    },
                  },
                },
          ),
        );
      }
      if (url.includes("/customers?"))
        return Promise.resolve(jsonResponse({ customers: [{ id: 42 }] }));
      if (url.includes("/subscriptions?"))
        return Promise.resolve(jsonResponse({ subscriptions }));
      if (url.includes("/charges?"))
        return Promise.resolve(jsonResponse({ charges: [] }));
      if (url.endsWith("/cancel")) return Promise.resolve(jsonResponse({}));
      if (url.startsWith("https://a.klaviyo.com/"))
        return Promise.resolve(new Response(null, { status: 202 }));
      throw new Error(`unexpected upstream call: ${url}`);
    }),
  );
  return calls;
};

const allowAll = {
  get: () => ({ limit: () => Promise.resolve({ success: true }) }),
  idFromName: (name: string) => name,
};

const post = (url: URL, body: unknown = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const run = (request: Request, extra: Record<string, unknown> = {}) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worker.fetch(request, { ...env, RATE_LIMITER: allowAll, ...extra } as any);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetAdminTokenCache();
});

describe("verifyProxyRequest", () => {
  const at = (params: Record<string, string>) => signed("/proxy/x", params);

  it("returns the signed-in customer", async () => {
    const params = proxyParams({ timestamp: String(NOW / 1000) });
    expect(await verifyProxyRequest(await at(params), SECRET, SHOP, NOW)).toBe(
      CUSTOMER_ID,
    );
  });

  it("returns empty when nobody is signed in", async () => {
    const params = proxyParams({
      timestamp: String(NOW / 1000),
      logged_in_customer_id: "",
    });
    expect(await verifyProxyRequest(await at(params), SECRET, SHOP, NOW)).toBe("");
  });

  it("⚠️ refuses a customer id changed after signing", async () => {
    const url = await at(proxyParams({ timestamp: String(NOW / 1000) }));
    url.searchParams.set("logged_in_customer_id", "1111111111");
    expect(await verifyProxyRequest(url, SECRET, SHOP, NOW)).toBeNull();
  });

  it("⚠️ refuses another secret, another shop, no signature and an old signature", async () => {
    const fresh = proxyParams({ timestamp: String(NOW / 1000) });
    expect(
      await verifyProxyRequest(await signed("/p", fresh, "wrong"), SECRET, SHOP, NOW),
    ).toBeNull();
    expect(
      await verifyProxyRequest(
        await at({ ...fresh, shop: "other.example" }),
        SECRET,
        SHOP,
        NOW,
      ),
    ).toBeNull();
    expect(
      await verifyProxyRequest(
        new URL("https://api.example/p?shop=x"),
        SECRET,
        SHOP,
        NOW,
      ),
    ).toBeNull();
    const old = proxyParams({ timestamp: String(NOW / 1000 - 600) });
    expect(await verifyProxyRequest(await at(old), SECRET, SHOP, NOW)).toBeNull();
  });
});

describe("confirmation token", () => {
  it("is accepted for its customer within ten minutes, and refused otherwise", async () => {
    const token = await confirmToken(SECRET, CUSTOMER_ID, NOW);
    expect(await checkConfirmToken(SECRET, CUSTOMER_ID, token, NOW + 9 * 60_000)).toBe(
      true,
    );
    expect(await checkConfirmToken(SECRET, CUSTOMER_ID, token, NOW + 11 * 60_000)).toBe(
      false,
    );
    expect(await checkConfirmToken(SECRET, "1111111111", token, NOW)).toBe(false);
    expect(await checkConfirmToken("other", CUSTOMER_ID, token, NOW)).toBe(false);
    expect(await checkConfirmToken(SECRET, CUSTOMER_ID, undefined, NOW)).toBe(false);
    expect(await checkConfirmToken(SECRET, CUSTOMER_ID, "123.abc", NOW)).toBe(false);
  });
});

describe("POST /proxy/account/deletion…", () => {
  it("previews for the signed customer and returns a confirmation token", async () => {
    const calls = stubUpstream([
      {
        id: 7,
        product_title: "Magnesium",
        variant_title: "",
        next_charge_scheduled_at: "2026-12-01",
        order_interval_frequency: "30",
        charge_interval_frequency: "30",
      },
    ]);
    const response = await run(
      post(await signed("/proxy/account/deletion/preview", proxyParams())),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      subscriptions: unknown[];
      confirmToken: string;
    };
    expect(body.subscriptions).toHaveLength(1);
    expect(body.confirmToken).toMatch(/^\d+\.[0-9a-f]{64}$/);
    // Recharge is asked about the signed customer, and nobody else.
    expect(calls.some((url) => url.includes(`external_customer_id=${CUSTOMER_ID}`))).toBe(
      true,
    );
  });

  it("deletes with the preview's token: cancel, Klaviyo, then Shopify", async () => {
    stubUpstream([
      {
        id: 7,
        product_title: "Magnesium",
        variant_title: "",
        next_charge_scheduled_at: "2026-12-01",
        order_interval_frequency: "30",
        charge_interval_frequency: "30",
      },
    ]);
    const preview = (await (
      await run(post(await signed("/proxy/account/deletion/preview", proxyParams())))
    ).json()) as { confirmToken: string };
    const calls = stubUpstream([
      {
        id: 7,
        product_title: "Magnesium",
        variant_title: "",
        next_charge_scheduled_at: "2026-12-01",
        order_interval_frequency: "30",
        charge_interval_frequency: "30",
      },
    ]);
    const response = await run(
      post(await signed("/proxy/account/deletion", proxyParams()), {
        confirm: "delete",
        token: preview.confirmToken,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, cancelled: 1 });
    const cancel = calls.findIndex((url) => url.endsWith("/cancel"));
    const klaviyo = calls.findIndex((url) => url.startsWith("https://a.klaviyo.com/"));
    expect(cancel).toBeGreaterThan(-1);
    expect(klaviyo).toBeGreaterThan(cancel);
  });

  it("⚠️ refuses a deletion without the preview's token, so another site can't post one", async () => {
    const calls = stubUpstream();
    for (const body of [
      { confirm: "delete" },
      { confirm: "delete", token: "1.ab" },
      {},
    ]) {
      const response = await run(
        post(await signed("/proxy/account/deletion", proxyParams()), body),
      );
      expect(response.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("⚠️ ignores a customer id in the body", async () => {
    const calls = stubUpstream();
    await run(
      post(await signed("/proxy/account/deletion/preview", proxyParams()), {
        customerId: "1111111111",
        logged_in_customer_id: "1111111111",
      }),
    );
    expect(calls.some((url) => url.includes("1111111111"))).toBe(false);
  });

  it("answers 401 when signed out, 403 when unsigned, 503 without the secret", async () => {
    const calls = stubUpstream();
    expect(
      (
        await run(
          post(
            await signed(
              "/proxy/account/deletion/preview",
              proxyParams({ logged_in_customer_id: "" }),
            ),
          ),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await run(
          post(
            new URL(
              `https://api.example/proxy/account/deletion/preview?shop=${SHOP}&logged_in_customer_id=${CUSTOMER_ID}`,
            ),
          ),
        )
      ).status,
    ).toBe(403);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (
        await run(post(await signed("/proxy/account/deletion/preview", proxyParams())), {
          SHOPIFY_APP_PROXY_SECRET: undefined,
        })
      ).status,
    ).toBe(503);
    expect(calls).toEqual([]);
  });

  it("limits per customer, not per IP: Shopify's servers send every request", async () => {
    stubUpstream();
    const names: string[] = [];
    const limiter = {
      get: () => ({ limit: () => Promise.resolve({ success: false }) }),
      idFromName: (name: string) => (names.push(name), name),
    };
    const response = await run(
      new Request(await signed("/proxy/account/deletion/preview", proxyParams()), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "CF-Connecting-IP": "23.227.38.1",
        },
        body: "{}",
      }),
      { RATE_LIMITER: limiter },
    );
    expect(response.status).toBe(429);
    expect(names).toEqual([`customer:${CUSTOMER_ID}`]);
  });

  it("answers 404 for any other proxied path", async () => {
    stubUpstream();
    expect((await run(post(await signed("/proxy/anything", proxyParams())))).status).toBe(
      404,
    );
  });
});
