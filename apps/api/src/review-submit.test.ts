import { afterEach, describe, expect, it, vi } from "vitest";

import { submitReview } from "./review-submit";

const env = {
  SHOPIFY_STORE_DOMAIN: "shop.example",
  JUDGEME_PRIVATE_TOKEN: "jm_private_not_real",
};
const review = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    productId: "gid://shopify/Product/10846338875704",
    rating: 5,
    name: "Sam Taylor",
    email: "sam@example.com",
    title: "Easy to take",
    body: "Small capsules, no aftertaste.",
    ...overrides,
  });

afterEach(() => vi.unstubAllGlobals());

describe("submitReview", () => {
  it("sends exactly the checked fields to Judge.me", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await submitReview(
      env,
      review({ extra: "ignored", platform: "woocommerce" }),
    );
    expect(result).toEqual({ status: 202, body: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(
      "https://judge.me/api/v1/reviews?shop_domain=shop.example&api_token=",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      shop_domain: "shop.example",
      platform: "shopify",
      id: 10846338875704,
      name: "Sam Taylor",
      email: "sam@example.com",
      rating: 5,
      title: "Easy to take",
      body: "Small capsules, no aftertaste.",
      reviewer_name_format: "last_initial",
    });
  });

  it.each([
    ["rating", { rating: 6 }],
    ["rating", { rating: 4.5 }],
    ["name", { name: "  " }],
    ["email", { email: "not-an-email" }],
    ["body", { body: "" }],
    ["body", { body: "x".repeat(2001) }],
    ["productId", { productId: "gid://shopify/ProductVariant/1" }],
  ])("rejects a bad %s without calling Judge.me", async (field, overrides) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitReview(env, review(overrides))).toEqual({
      status: 400,
      body: { ok: false, reason: "invalid", field },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when it isn't configured, and when Judge.me refuses", async () => {
    expect(
      (await submitReview({ SHOPIFY_STORE_DOMAIN: "shop.example" }, review())).body,
    ).toEqual({
      ok: false,
      reason: "not-configured",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 422 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await submitReview(env, review())).status).toBe(502);
  });
});
