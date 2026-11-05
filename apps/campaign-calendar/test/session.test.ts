import { describe, expect, it } from "vitest";

import { verifySessionToken } from "../src/session";

const SHOP = "example.myshopify.com";
const CLIENT_ID = "client-id";
const SECRET = "app-secret";

const b64 = (data: string | Uint8Array) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const sign = async (payload: Record<string, unknown>, secret = SECRET, alg = "HS256") => {
  const head = b64(JSON.stringify({ alg, typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)),
  );
  return `${head}.${body}.${b64(mac)}`;
};

const now = new Date("2026-11-03T10:00:00Z");
const t = Math.floor(now.getTime() / 1000);
const good = {
  iss: `https://${SHOP}/admin`,
  dest: `https://${SHOP}`,
  aud: CLIENT_ID,
  sub: "42",
  exp: t + 60,
  nbf: t - 1,
};
const verify = (token: string) =>
  verifySessionToken(token, { clientId: CLIENT_ID, secret: SECRET, shop: SHOP, now });

describe("verifySessionToken", () => {
  it("accepts Shopify's token for our app and shop", async () => {
    expect(await verify(await sign(good))).toMatchObject({ shop: SHOP, user: "42" });
  });

  it("refuses another secret, audience or shop", async () => {
    expect(await verify(await sign(good, "other-secret"))).toBeNull();
    expect(await verify(await sign({ ...good, aud: "someone-else" }))).toBeNull();
    expect(
      await verify(
        await sign({
          ...good,
          iss: "https://evil.myshopify.com/admin",
          dest: "https://evil.myshopify.com",
        }),
      ),
    ).toBeNull();
    expect(
      await verify(await sign({ ...good, dest: "https://evil.myshopify.com" })),
    ).toBeNull();
  });

  it("refuses an expired or not-yet-valid token", async () => {
    expect(await verify(await sign({ ...good, exp: t - 10 }))).toBeNull();
    expect(await verify(await sign({ ...good, nbf: t + 60 }))).toBeNull();
  });

  it("refuses other algorithms and garbage", async () => {
    expect(await verify(await sign(good, SECRET, "none"))).toBeNull();
    expect(await verify("not.a.token")).toBeNull();
    expect(await verify("")).toBeNull();
  });
});
