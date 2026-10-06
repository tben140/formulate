import { webcrypto } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  base64Url,
  codeChallengeFor,
  createAuthorizationRequest,
  customerAccountEndpoints,
  customerAccountRequest,
  exchangeCode,
  isTokenExpiring,
  logoutUrl,
  refreshTokens,
  validateIdToken,
  type AuthCrypto,
  type CustomerAccountConfig,
  type CustomerTokens,
} from "./customer-account";
import { orderGid, orderPathId, orderStatusLabel } from "./customer-orders";

const CONFIG: CustomerAccountConfig = {
  shopId: "100581966136",
  clientId: "9564ac4b-09bb-49b2-936a-6d14bdeaf108",
  apiVersion: "2026-04",
};

const ISSUER = "https://shopify.com/authentication/100581966136";
const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);

const nodeCrypto: AuthCrypto = {
  randomBytes: (length) => webcrypto.getRandomValues(new Uint8Array(length)),
  sha256: (data) => webcrypto.subtle.digest("SHA-256", data),
};

const encode = (value: object): string =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

/** An unsigned JWT: the code under test deliberately never checks signatures. */
const idToken = (claims: Record<string, unknown>): string =>
  `${encode({ alg: "RS256" })}.${encode({
    iss: ISSUER,
    aud: CONFIG.clientId,
    exp: NOW / 1000 + 3600,
    nonce: "the-nonce",
    email: "ben@example.com",
    ...claims,
  })}.signature`;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("customerAccountEndpoints", () => {
  it("matches the store's discovery documents", () => {
    // Values from /.well-known/openid-configuration and
    // /.well-known/customer-account-api, fetched 2026-10-06.
    expect(customerAccountEndpoints(CONFIG)).toEqual({
      issuer: ISSUER,
      authorize: `${ISSUER}/oauth/authorize`,
      token: `${ISSUER}/oauth/token`,
      logout: `${ISSUER}/logout`,
      graphql: "https://shopify.com/100581966136/account/customer/api/2026-04/graphql",
    });
  });
});

describe("codeChallengeFor", () => {
  it("matches RFC 7636's worked example", async () => {
    // RFC 7636 Appendix B: the one input whose right answer is published.
    await expect(
      codeChallengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", nodeCrypto),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("createAuthorizationRequest", () => {
  it("builds a PKCE authorisation URL with fresh state, nonce and verifier", async () => {
    const result = await createAuthorizationRequest(
      CONFIG,
      { redirectUri: "https://shop.example/account/authorize" },
      nodeCrypto,
    );
    if (!result.ok) throw new Error("expected ok");

    const { url, state, nonce, codeVerifier } = result.data;
    const params = new URL(url).searchParams;

    expect(url.startsWith(`${ISSUER}/oauth/authorize?`)).toBe(true);
    expect(params.get("client_id")).toBe(CONFIG.clientId);
    expect(params.get("response_type")).toBe("code");
    expect(params.get("scope")).toBe("openid email customer-account-api:full");
    expect(params.get("redirect_uri")).toBe("https://shop.example/account/authorize");
    expect(params.get("state")).toBe(state);
    expect(params.get("nonce")).toBe(nonce);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toBe(
      await codeChallengeFor(codeVerifier, nodeCrypto),
    );

    // RFC 7636: 43 to 128 characters from the unreserved set.
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    // The verifier itself must never be on the URL.
    expect(url).not.toContain(codeVerifier);
    expect(new Set([state, nonce, codeVerifier]).size).toBe(3);
  });

  it("refuses to start without a client id", async () => {
    const result = await createAuthorizationRequest(
      { ...CONFIG, clientId: "" },
      { redirectUri: "https://shop.example/account/authorize" },
      nodeCrypto,
    );
    expect(result).toMatchObject({ ok: false, error: { kind: "config" } });
  });
});

describe("validateIdToken", () => {
  const check = (claims: Record<string, unknown>, nonce = "the-nonce") =>
    validateIdToken(CONFIG, idToken(claims), { nonce, now: NOW });

  it("accepts a token for this shop, client and sign-in", () => {
    expect(check({})).toEqual({ ok: true, data: { email: "ben@example.com" } });
  });

  it("accepts an audience given as an array", () => {
    expect(check({ aud: ["other", CONFIG.clientId] }).ok).toBe(true);
  });

  it.each([
    ["another shop's issuer", { iss: "https://shopify.com/authentication/1" }],
    ["another client's audience", { aud: "someone-else" }],
    ["an expired token", { exp: NOW / 1000 - 1 }],
  ])("rejects %s", (_label, claims) => {
    expect(check(claims)).toMatchObject({
      ok: false,
      error: { kind: "invalid-id-token" },
    });
  });

  it("rejects a token from a different sign-in attempt", () => {
    // The replay this exists to stop: a valid token, issued to someone, for a
    // sign-in this browser didn't start.
    expect(check({}, "a-different-nonce")).toMatchObject({
      ok: false,
      error: { kind: "invalid-id-token", message: "nonce does not match this sign-in" },
    });
  });

  it("reads a non-ASCII email correctly", () => {
    expect(check({ email: "zoë@example.com" })).toEqual({
      ok: true,
      data: { email: "zoë@example.com" },
    });
  });

  it("rejects something that isn't a JWT", () => {
    expect(validateIdToken(CONFIG, "nonsense", { nonce: "x", now: NOW }).ok).toBe(false);
  });
});

describe("exchangeCode", () => {
  const exchange = () =>
    exchangeCode(CONFIG, {
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "https://shop.example/account/authorize",
      nonce: "the-nonce",
      origin: "https://shop.example",
      now: NOW,
    });

  it("posts the grant as a form, and returns the tokens with an absolute expiry", async () => {
    const fetchMock = vi.fn(async () =>
      json({
        access_token: "shcat_access",
        refresh_token: "shcrt_refresh",
        id_token: idToken({}),
        expires_in: 3600,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await exchange();

    expect(result).toEqual({
      ok: true,
      data: {
        accessToken: "shcat_access",
        refreshToken: "shcrt_refresh",
        idToken: idToken({}),
        expiresAt: NOW + 3600 * 1000,
      },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ISSUER}/oauth/token`);
    expect(init.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://shop.example",
    });
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: CONFIG.clientId,
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: "the-verifier",
      redirect_uri: "https://shop.example/account/authorize",
    });
  });

  it("refuses tokens whose id token is for another sign-in", async () => {
    vi.stubGlobal("fetch", async () =>
      json({
        access_token: "a",
        refresh_token: "r",
        id_token: idToken({ nonce: "someone-elses" }),
        expires_in: 3600,
      }),
    );
    expect(await exchange()).toMatchObject({
      ok: false,
      error: { kind: "invalid-id-token" },
    });
  });

  it("returns Shopify's OAuth error for a spent code", async () => {
    vi.stubGlobal("fetch", async () => json({ error: "invalid_grant" }, 400));
    expect(await exchange()).toMatchObject({
      ok: false,
      error: { kind: "http", status: 400, message: '{"error":"invalid_grant"}' },
    });
  });

  it("reports a network failure as one", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect(await exchange()).toMatchObject({ ok: false, error: { kind: "network" } });
  });
});

describe("refreshTokens", () => {
  const current: CustomerTokens = {
    accessToken: "old-access",
    refreshToken: "old-refresh",
    idToken: "old-id",
    expiresAt: NOW,
  };

  it("keeps the id token and refresh token when the response omits them", async () => {
    vi.stubGlobal("fetch", async () =>
      json({ access_token: "new-access", expires_in: 7200 }),
    );
    expect(await refreshTokens(CONFIG, current, { now: NOW })).toEqual({
      ok: true,
      data: {
        accessToken: "new-access",
        refreshToken: "old-refresh",
        idToken: "old-id",
        expiresAt: NOW + 7200 * 1000,
      },
    });
  });

  it("takes a rotated refresh token", async () => {
    vi.stubGlobal("fetch", async () =>
      json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 60 }),
    );
    const result = await refreshTokens(CONFIG, current, { now: NOW });
    expect(result.ok && result.data.refreshToken).toBe("new-refresh");
  });
});

describe("isTokenExpiring", () => {
  it("treats a token inside the last minute as already expired", () => {
    expect(isTokenExpiring({ expiresAt: NOW + 59_000 }, NOW)).toBe(true);
    expect(isTokenExpiring({ expiresAt: NOW + 61_000 }, NOW)).toBe(false);
  });
});

describe("logoutUrl", () => {
  it("ends the Shopify session and comes back to the shop", () => {
    const url = new URL(
      logoutUrl(CONFIG, {
        idToken: "the-id",
        postLogoutRedirectUri: "https://shop.example/",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${ISSUER}/logout`);
    expect(url.searchParams.get("id_token_hint")).toBe("the-id");
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe(
      "https://shop.example/",
    );
  });
});

describe("customerAccountRequest", () => {
  it("sends the access token without a Bearer prefix", async () => {
    const fetchMock = vi.fn(async () => json({ data: { customer: { id: "1" } } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await customerAccountRequest(
      CONFIG,
      "shcat_access",
      "{ customer { id } }",
    );

    expect(result).toEqual({ ok: true, data: { customer: { id: "1" } } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: "shcat_access" });
  });

  it("surfaces 401 so the caller can send the buyer to sign in", async () => {
    vi.stubGlobal("fetch", async () => new Response("Unauthorized", { status: 401 }));
    expect(
      await customerAccountRequest(CONFIG, "expired", "{ customer { id } }"),
    ).toMatchObject({ ok: false, error: { kind: "http", status: 401 } });
  });
});

describe("order ids in URLs", () => {
  it("round-trips an order gid through a path segment", () => {
    expect(orderPathId("gid://shopify/Order/7333415387448")).toBe("7333415387448");
    expect(orderGid("7333415387448")).toBe("gid://shopify/Order/7333415387448");
  });

  it("refuses anything that isn't a plain order id", () => {
    expect(orderPathId("gid://shopify/Customer/1")).toBeNull();
    expect(orderGid("1/../Customer/2")).toBeNull();
  });

  it("makes Shopify's status enums readable", () => {
    expect(orderStatusLabel("PARTIALLY_REFUNDED")).toBe("Partially refunded");
    expect(orderStatusLabel(null)).toBeNull();
  });
});
