import { afterEach, describe, expect, it, vi } from "vitest";

import { createStorefrontClient } from "./client";
import { ShopNameQuery } from "./queries";

const config = {
  domain: "example.myshopify.com",
  token: "public",
  apiVersion: "2026-04",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createStorefrontClient", () => {
  it("gives up on a request that doesn't answer in time", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const result = await createStorefrontClient({ ...config, timeoutMs: 20 }).request(
      ShopNameQuery,
    );
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        kind: "network",
        message: "Storefront request timed out after 20 ms",
      }),
    });
  });

  it("returns the data when the answer comes in time", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        data: { shop: { name: "Shop", primaryDomain: { url: "https://example.com" } } },
      }),
    );
    const result = await createStorefrontClient(config).request(ShopNameQuery);
    expect(result).toEqual({
      ok: true,
      data: { shop: { name: "Shop", primaryDomain: { url: "https://example.com" } } },
    });
  });
});
