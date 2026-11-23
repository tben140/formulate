import { afterEach, describe, expect, it, vi } from "vitest";

import { checkReviewer, customerToken } from "./review-customer";

const env = { SHOPIFY_SHOP_ID: "100581966136", SHOPIFY_API_VERSION: "2026-04" };
const PRODUCT = "10846338875704";

const customer = (
  productIds: (string | null)[],
  email: string | null = "sam@example.com",
) => ({
  data: {
    customer: {
      id: "gid://shopify/Customer/42",
      emailAddress: email ? { emailAddress: email } : null,
      orders: {
        nodes: [{ lineItems: { nodes: productIds.map((productId) => ({ productId })) } }],
      },
    },
  },
});

const shopify = (body: unknown, status = 200) => {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
};

afterEach(() => vi.unstubAllGlobals());

describe("checkReviewer", () => {
  it("asks Shopify with the caller's token, and takes the email from its answer", async () => {
    const mock = shopify(customer([`gid://shopify/Product/${PRODUCT}`]));
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "ok",
      customerId: "42",
      email: "sam@example.com",
    });
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://shopify.com/100581966136/account/customer/api/2026-04/graphql",
    );
    expect(init.headers).toMatchObject({ Authorization: "shcat_token" });
  });

  it("refuses a product that isn't in the customer's orders", async () => {
    shopify(customer(["gid://shopify/Product/1", null]));
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "not-purchased",
    });
  });

  it("needs an email for Judge.me to verify the review", async () => {
    shopify(customer([`gid://shopify/Product/${PRODUCT}`], null));
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "no-email",
    });
  });

  it("treats a refused token as signed out, and a Shopify failure as unavailable", async () => {
    shopify({ errors: [] }, 401);
    expect(await checkReviewer(env, "expired", PRODUCT)).toEqual({ kind: "signed-out" });
    shopify({}, 503);
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "unavailable",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "unavailable",
    });
    shopify({ data: { customer: null } });
    expect(await checkReviewer(env, "shcat_token", PRODUCT)).toEqual({
      kind: "signed-out",
    });
  });
});

describe("customerToken", () => {
  it("takes the bare token, with or without Bearer", () => {
    const request = (value?: string) =>
      new Request("https://api.example/reviews/new", {
        headers: value ? { Authorization: value } : {},
      });
    expect(customerToken(request("shcat_a"))).toBe("shcat_a");
    expect(customerToken(request("Bearer shcat_b"))).toBe("shcat_b");
    expect(customerToken(request())).toBeNull();
  });
});
