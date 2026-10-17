import { afterEach, describe, expect, it, vi } from "vitest";

import { listReviews, toPublicReview, type ReviewsEnv } from "./reviews";

const env: ReviewsEnv = {
  SHOPIFY_STORE_DOMAIN: "shop.example",
  JUDGEME_PRIVATE_TOKEN: "jm_private_not_real",
};

/** A Judge.me review as the API returns it, private fields included. */
const judgemeReview = (overrides: Record<string, unknown> = {}) => ({
  id: 101,
  title: "Easy to take",
  body: "Small capsules, no aftertaste.",
  rating: 5,
  product_external_id: "10940384149816",
  source: "web",
  curated: "ok",
  published: true,
  hidden: false,
  verified: "buyer",
  created_at: "2026-10-01T09:00:00Z",
  pictures: [
    { urls: { small: "https://cdn.judge.me/s.jpg", huge: "https://cdn.judge.me/h.jpg" } },
  ],
  reviewer: {
    id: 9,
    external_id: "8812345678",
    email: "sam@formulate.example",
    name: "Sam Taylor",
    phone: "+447700900123",
    accepts_marketing: true,
    tags: "",
  },
  ...overrides,
});

const stub = (
  opts: { product?: [number, unknown]; reviews?: [number, unknown] } = {},
) => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: URL | string) => {
      const url = String(input);
      calls.push(url);
      const [status, body] = url.includes("/products/-1")
        ? (opts.product ?? [200, { product: { id: 555, handle: "magnesium-glycinate" } }])
        : (opts.reviews ?? [
            200,
            { current_page: 1, per_page: 10, reviews: [judgemeReview()] },
          ]);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
  return calls;
};

const body = (data: unknown) => JSON.stringify(data);

afterEach(() => vi.unstubAllGlobals());

describe("⚠️ what leaves the Worker", () => {
  it("copies out only the public fields: no email, phone, marketing status or full name", async () => {
    stub();
    const result = await listReviews(env, body({ handle: "magnesium-glycinate" }));
    expect(result.body).toEqual({
      ok: true,
      page: 1,
      hasMore: false,
      reviews: [
        {
          id: 101,
          rating: 5,
          title: "Easy to take",
          body: "Small capsules, no aftertaste.",
          author: "Sam T.",
          createdAt: "2026-10-01T09:00:00Z",
          verifiedBuyer: true,
          pictures: ["https://cdn.judge.me/h.jpg"],
          sample: false,
        },
      ],
    });
    const text = JSON.stringify(result.body);
    for (const leak of [
      "sam@formulate.example",
      "+447700900123",
      "Taylor",
      "accepts_marketing",
      "8812345678",
    ]) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it("never sends the private token anywhere but Judge.me", async () => {
    const calls = stub();
    await listReviews(env, body({ handle: "magnesium-glycinate" }));
    for (const url of calls) expect(new URL(url).host).toBe("judge.me");
  });

  it("drops unpublished, hidden and spam reviews, and invalid ratings", () => {
    expect(toPublicReview(judgemeReview({ published: false }))).toBeNull();
    expect(toPublicReview(judgemeReview({ hidden: true }))).toBeNull();
    expect(toPublicReview(judgemeReview({ curated: "spam" }))).toBeNull();
    expect(toPublicReview(judgemeReview({ rating: 7 }))).toBeNull();
  });

  it("marks samples by an example.com/.org/.net email too, which no real customer has", () => {
    for (const email of ["demo@example.com", "a@EXAMPLE.org ", "x@example.net"]) {
      expect(
        toPublicReview(judgemeReview({ reviewer: { name: "Demo", email } }))?.sample,
        email,
      ).toBe(true);
    }
    expect(
      toPublicReview(
        judgemeReview({ reviewer: { name: "Sam", email: "sam@examples.com" } }),
      )?.sample,
    ).toBe(false);
  });

  it("marks reviews tagged as samples, so every surface labels them", () => {
    expect(
      toPublicReview(
        judgemeReview({ reviewer: { name: "Demo Reviewer", tags: "sample, demo" } }),
      )?.sample,
    ).toBe(true);
  });

  it("only passes on https picture URLs", () => {
    expect(
      toPublicReview(
        judgemeReview({ pictures: [{ urls: { huge: "javascript:alert(1)" } }] }),
      )?.pictures,
    ).toEqual([]);
  });
});

describe("requests", () => {
  it("resolves the handle, then lists that product's reviews, ten a page", async () => {
    const calls = stub();
    await listReviews(env, body({ handle: "magnesium-glycinate", page: 2 }));
    const lookup = new URL(calls[0] ?? "");
    expect(lookup.pathname).toBe("/api/v1/products/-1");
    expect(lookup.searchParams.get("handle")).toBe("magnesium-glycinate");
    const list = new URL(calls[1] ?? "");
    expect(Object.fromEntries(list.searchParams)).toMatchObject({
      shop_domain: "shop.example",
      product_id: "555",
      page: "2",
      per_page: "10",
    });
  });

  it("rejects handles and pages that aren't plainly valid, without calling Judge.me", async () => {
    const calls = stub();
    for (const bad of [
      { handle: "../admin" },
      { handle: "x?api_token=steal" },
      { handle: "" },
      { handle: "ok", page: 0 },
      { handle: "ok", page: "2; drop" },
    ]) {
      expect((await listReviews(env, body(bad))).status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("answers an empty list for a product Judge.me hasn't seen", async () => {
    stub({ product: [404, {}] });
    expect((await listReviews(env, body({ handle: "new-product" }))).body).toEqual({
      ok: true,
      reviews: [],
      page: 1,
      hasMore: false,
    });
  });

  it("says when there may be more", async () => {
    stub({
      reviews: [
        200,
        { reviews: Array.from({ length: 10 }, (_, i) => judgemeReview({ id: i })) },
      ],
    });
    expect((await listReviews(env, body({ handle: "x" }))).body).toMatchObject({
      hasMore: true,
    });
  });

  it("answers 503 without the token, and 502 (no Judge.me body) when it fails", async () => {
    const calls = stub({ reviews: [500, { error: "internal detail" }] });
    expect(
      await listReviews(
        { ...env, JUDGEME_PRIVATE_TOKEN: undefined },
        body({ handle: "x" }),
      ),
    ).toEqual({ status: 503, body: { ok: false, reason: "not-configured" } });
    expect(calls).toEqual([]);
    const failed = await listReviews(env, body({ handle: "x" }));
    expect(failed).toEqual({ status: 502, body: { ok: false, reason: "unavailable" } });
  });
});
