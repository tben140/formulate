import { describe, expect, it, vi } from "vitest";

import {
  campaignLogRoute,
  diffFields,
  verifyShopifyHmac,
  webhookFields,
} from "./campaign-log";

const SECRET = "test-secret";
const sign = async (body: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
  );
  return btoa(String.fromCharCode(...mac));
};

const fakeLog = () => {
  const record = vi.fn(async () => null);
  const history = vi.fn(async () => [
    { at: "x", topic: "metaobjects/update", handle: "bf", changes: [] },
  ]);
  return {
    record,
    history,
    env: {
      SHOPIFY_APP_CLIENT_SECRET: SECRET,
      CAMPAIGN_LOG_TOKEN: "read-token",
      CAMPAIGN_LOG: { idFromName: () => "id", get: () => ({ record, history }) } as never,
    },
  };
};

const webhook = (body: string, headers: Record<string, string>) =>
  new Request("https://api.example/webhooks/shopify/campaigns", {
    method: "POST",
    body,
    headers,
  });

describe("diffFields and webhookFields", () => {
  it("lists only what changed, by key", () => {
    expect(
      diffFields(
        { terms: "a", badge: "BF", ends_at: "1" },
        { terms: "b", badge: "BF", offer: "25%" },
      ),
    ).toEqual([
      { field: "ends_at", before: "1", after: null },
      { field: "offer", before: null, after: "25%" },
      { field: "terms", before: "a", after: "b" },
    ]);
  });

  it("reads both shapes of webhook fields", () => {
    expect(
      webhookFields({
        fields: {
          badge: { value: "BF" },
          offer: "25%",
          rules: { type: "percent" },
          x: null,
        },
      }),
    ).toEqual({
      badge: "BF",
      offer: "25%",
      rules: '{"type":"percent"}',
      x: null,
    });
    expect(webhookFields({})).toEqual({});
  });
});

describe("verifyShopifyHmac", () => {
  it("accepts Shopify's signature and nothing else", async () => {
    const body = '{"handle":"bf"}';
    expect(await verifyShopifyHmac(body, await sign(body), SECRET)).toBe(true);
    expect(await verifyShopifyHmac(body + " ", await sign(body), SECRET)).toBe(false);
    expect(await verifyShopifyHmac(body, null, SECRET)).toBe(false);
    expect(await verifyShopifyHmac(body, await sign(body), "")).toBe(false);
  });
});

describe("campaignLogRoute", () => {
  it("records a signed campaign webhook", async () => {
    const { env, record } = fakeLog();
    const body = JSON.stringify({
      type: "campaign",
      handle: "bf",
      fields: { terms: { value: "t" } },
      updated_at: "2026-11-01T10:00:00Z",
    });
    const response = await campaignLogRoute(
      webhook(body, {
        "x-shopify-hmac-sha256": await sign(body),
        "x-shopify-topic": "metaobjects/update",
      }),
      env,
    );
    expect(response?.status).toBe(200);
    expect(record).toHaveBeenCalledWith(
      "metaobjects/update",
      "bf",
      { terms: "t" },
      "2026-11-01T10:00:00Z",
    );
  });

  it("refuses a bad signature, and ignores other metaobject types", async () => {
    const { env, record } = fakeLog();
    const body = JSON.stringify({ type: "campaign", handle: "bf", fields: {} });
    expect(
      (
        await campaignLogRoute(
          webhook(body, {
            "x-shopify-hmac-sha256": "nope",
            "x-shopify-topic": "metaobjects/update",
          }),
          env,
        )
      )?.status,
    ).toBe(401);
    const other = JSON.stringify({ type: "faq", handle: "x", fields: {} });
    expect(
      (
        await campaignLogRoute(
          webhook(other, {
            "x-shopify-hmac-sha256": await sign(other),
            "x-shopify-topic": "metaobjects/update",
          }),
          env,
        )
      )?.status,
    ).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  it("serves the log only with the token", async () => {
    const { env } = fakeLog();
    const get = (auth?: string) =>
      campaignLogRoute(
        new Request("https://api.example/campaigns/log?handle=bf", {
          headers: auth ? { authorization: auth } : {},
        }),
        env,
      );
    expect((await get())?.status).toBe(401);
    expect((await get("Bearer wrong"))?.status).toBe(401);
    const ok = await get("Bearer read-token");
    expect(ok?.status).toBe(200);
    expect(await ok?.json()).toHaveLength(1);
  });

  it("leaves every other path to the consent endpoint", async () => {
    const { env } = fakeLog();
    expect(
      await campaignLogRoute(
        new Request("https://api.example/", { method: "POST" }),
        env,
      ),
    ).toBeNull();
  });
});
