import { describe, expect, it } from "vitest";

import { scrubTransaction, type TransactionLike } from "./trace-scrub";

const event = (): TransactionLike => ({
  transaction: "GET /search?q=melatonin",
  request: { url: "https://api.example/?a=1", data: '{"email":"a@b.co"}' },
  user: { ip_address: "203.0.113.7" },
  contexts: {
    trace: {
      data: {
        "http.request.method": "POST",
        "url.full": "https://api.example/subscribe?token=secret#frag",
        "url.query": "token=secret",
        "http.request.header.cf_connecting_ip": "203.0.113.7",
        "http.request.header.x_forwarded_for": "203.0.113.7",
        "user_agent.original": "Mozilla/5.0",
        "client.address": "203.0.113.7",
        "http.response.status_code": 202,
      },
    },
  },
  spans: [
    {
      description: "POST https://shop.example/account/callback?code=abc&state=xyz",
      data: {
        url: "https://shop.example/account/callback?code=abc&state=xyz",
        "http.query": "?code=abc&state=xyz",
        "http.method": "POST",
        "server.address": "shop.example",
      },
    },
    { description: "Navigation dispatch to screen products/[handle] mounted" },
  ],
});

describe("scrubTransaction", () => {
  it("drops the request and the user", () => {
    const out = scrubTransaction(event());
    expect(out.request).toBeUndefined();
    expect(out.user).toBeUndefined();
  });

  it("strips the query from the transaction name and span names", () => {
    const out = scrubTransaction(event());
    expect(out.transaction).toBe("GET /search");
    expect(out.spans?.[0]?.description).toBe(
      "POST https://shop.example/account/callback",
    );
    expect(out.spans?.[1]?.description).toBe(
      "Navigation dispatch to screen products/[handle] mounted",
    );
  });

  it("keeps URLs, without their query or fragment", () => {
    const out = scrubTransaction(event());
    expect(out.contexts?.trace?.data?.["url.full"]).toBe("https://api.example/subscribe");
    expect(out.spans?.[0]?.data?.url).toBe("https://shop.example/account/callback");
  });

  it("drops headers, the IP, the user agent and query attributes", () => {
    const out = scrubTransaction(event());
    expect(out.contexts?.trace?.data).toEqual({
      "http.request.method": "POST",
      "url.full": "https://api.example/subscribe",
      "http.response.status_code": 202,
    });
    expect(out.spans?.[0]?.data).toEqual({
      url: "https://shop.example/account/callback",
      "http.method": "POST",
      "server.address": "shop.example",
    });
  });

  it("nothing personal survives anywhere in the event", () => {
    const text = JSON.stringify(scrubTransaction(event()));
    for (const secret of [
      "203.0.113.7",
      "a@b.co",
      "secret",
      "code=abc",
      "melatonin",
      "Mozilla",
    ]) {
      expect(text).not.toContain(secret);
    }
  });
});
