import { afterEach, describe, expect, it, vi } from "vitest";

import { adminAccessToken, resetAdminTokenCache } from "./shopify-admin";

const env = {
  SHOPIFY_STORE_DOMAIN: "shop.example",
  SHOPIFY_CLIENT_ID: "client-id",
  SHOPIFY_CLIENT_SECRET: "client-secret",
};

const tokenResponse = (token: string) =>
  new Response(JSON.stringify({ access_token: token, scope: "x", expires_in: 86399 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  resetAdminTokenCache();
  vi.unstubAllGlobals();
});

describe("adminAccessToken", () => {
  it("renews five minutes before the 24 hours are up, not after", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("first"))
      .mockResolvedValueOnce(tokenResponse("second"));
    vi.stubGlobal("fetch", fetchMock);

    const start = Date.UTC(2026, 9, 9, 9, 0, 0);
    expect(await adminAccessToken(env, start)).toBe("first");
    // 23h 50m later: still within its life, minus the margin.
    expect(await adminAccessToken(env, start + (23 * 60 + 50) * 60_000)).toBe("first");
    // 23h 56m later: inside the five-minute margin, so a new one.
    expect(await adminAccessToken(env, start + (23 * 60 + 56) * 60_000)).toBe("second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks again after a failure instead of caching it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"error":"shop_not_permitted"}', { status: 400 }),
      )
      .mockResolvedValueOnce(tokenResponse("later"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await adminAccessToken(env)).toBeNull();
    expect(await adminAccessToken(env)).toBe("later");
  });

  it("doesn't reuse a token issued to different credentials", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("old-app"))
      .mockResolvedValueOnce(tokenResponse("new-app"));
    vi.stubGlobal("fetch", fetchMock);

    expect(await adminAccessToken(env)).toBe("old-app");
    expect(await adminAccessToken({ ...env, SHOPIFY_CLIENT_ID: "rotated" })).toBe(
      "new-app",
    );
  });
});
