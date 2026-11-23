import { afterEach, describe, expect, it, vi } from "vitest";

import { parseReview, sendReview, type CheckedReview } from "./review-submit";

const env = {
  SHOPIFY_STORE_DOMAIN: "shop.example",
  JUDGEME_PRIVATE_TOKEN: "jm_private_not_real",
};
const review = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    productId: "gid://shopify/Product/10846338875704",
    rating: 5,
    name: "Sam Taylor",
    title: "Easy to take",
    body: "Small capsules, no aftertaste.",
    ...overrides,
  });
const checked: CheckedReview = {
  productId: "10846338875704",
  rating: 5,
  name: "Sam Taylor",
  title: "Easy to take",
  body: "Small capsules, no aftertaste.",
};

afterEach(() => vi.unstubAllGlobals());

describe("parseReview", () => {
  it("keeps exactly the checked fields, and never an email from the caller", () => {
    expect(
      parseReview(review({ email: "someone-else@example.com", platform: "woocommerce" })),
    ).toEqual({ ok: true, review: checked });
  });

  it.each([
    ["rating", { rating: 6 }],
    ["rating", { rating: 4.5 }],
    ["name", { name: "  " }],
    ["body", { body: "" }],
    ["body", { body: "x".repeat(2001) }],
    ["productId", { productId: "gid://shopify/ProductVariant/1" }],
  ])("rejects a bad %s", (field, overrides) => {
    expect(parseReview(review(overrides))).toEqual({
      ok: false,
      result: { status: 400, body: { ok: false, reason: "invalid", field } },
    });
  });
});

describe("sendReview", () => {
  it("sends the checked fields to Judge.me under the given email", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendReview(env, checked, "sam@example.com")).toEqual({
      status: 202,
      body: { ok: true },
    });
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

  it("says when it isn't configured, and when Judge.me refuses", async () => {
    expect(
      (await sendReview({ SHOPIFY_STORE_DOMAIN: "shop.example" }, checked, "a@b.co"))
        .body,
    ).toEqual({ ok: false, reason: "not-configured" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 422 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendReview(env, checked, "a@b.co")).status).toBe(502);
  });
});
