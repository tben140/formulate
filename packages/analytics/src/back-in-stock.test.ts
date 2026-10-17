import { afterEach, describe, expect, it, vi } from "vitest";

import {
  backInStockPayload,
  backInStockUrl,
  catalogVariantId,
  submitBackInStock,
} from "./back-in-stock";
import { KLAVIYO_REVISION } from "./subscribe";

const PUBLIC_KEY = "X2g4U5";
const GID = "gid://shopify/ProductVariant/52871790756152";

afterEach(() => vi.unstubAllGlobals());

describe("catalogVariantId", () => {
  it("maps a Storefront gid, a Liquid number and a numeric string to Klaviyo's id", () => {
    const expected = "$shopify:::$default:::52871790756152";
    expect(catalogVariantId(GID)).toBe(expected);
    expect(catalogVariantId(52871790756152)).toBe(expected);
    expect(catalogVariantId("52871790756152")).toBe(expected);
  });

  it("refuses ids that would match nothing, rather than sending them", () => {
    expect(catalogVariantId("")).toBeNull();
    expect(catalogVariantId("gid://shopify/ProductVariant/abc")).toBeNull();
    expect(catalogVariantId(0)).toBeNull();
    expect(catalogVariantId(1.5)).toBeNull();
  });
});

describe("backInStockPayload", () => {
  it("is Klaviyo's documented shape: email only, the email channel, one variant", () => {
    expect(
      backInStockPayload({ email: " a@b.co ", variantId: "$shopify:::$default:::1" }),
    ).toEqual({
      data: {
        type: "back-in-stock-subscription",
        attributes: {
          channels: ["EMAIL"],
          profile: { data: { type: "profile", attributes: { email: "a@b.co" } } },
        },
        relationships: {
          variant: { data: { type: "catalog-variant", id: "$shopify:::$default:::1" } },
        },
      },
    });
  });
});

describe("submitBackInStock", () => {
  it("validates before any request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const base = { publicKey: PUBLIC_KEY, variant: GID };
    expect(await submitBackInStock({ ...base, email: " " })).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(await submitBackInStock({ ...base, email: "nope" })).toEqual({
      ok: false,
      reason: "invalid-email",
    });
    expect(
      await submitBackInStock({ ...base, email: "a@b.co", variant: "not-a-variant" }),
    ).toEqual({ ok: false, reason: "not-configured" });
    expect(await submitBackInStock({ ...base, publicKey: "", email: "a@b.co" })).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts JSON:API to the client endpoint with the pinned revision", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(
      await submitBackInStock({ publicKey: PUBLIC_KEY, email: "a@b.co", variant: GID }),
    ).toEqual({ ok: true });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(backInStockUrl(PUBLIC_KEY));
    expect(url).toBe(
      "https://a.klaviyo.com/client/back-in-stock-subscriptions/?company_id=X2g4U5",
    );
    expect(init.headers).toEqual({
      "Content-Type": "application/vnd.api+json",
      revision: KLAVIYO_REVISION,
    });
    expect(JSON.parse(init.body as string)).toEqual(
      backInStockPayload({
        email: "a@b.co",
        variantId: "$shopify:::$default:::52871790756152",
      }),
    );
  });

  it("reports a rejection with Klaviyo's detail, and a failed fetch as network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"errors":[]}', { status: 400 })),
    );
    expect(
      await submitBackInStock({ publicKey: PUBLIC_KEY, email: "a@b.co", variant: GID }),
    ).toEqual({ ok: false, reason: "rejected", status: 400, detail: '{"errors":[]}' });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(
      await submitBackInStock({ publicKey: PUBLIC_KEY, email: "a@b.co", variant: GID }),
    ).toEqual({ ok: false, reason: "network" });
  });
});
