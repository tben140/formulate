import { describe, expect, it } from "vitest";

import { handle, type Env } from "../src/index";

const env: Env = {
  SHOPIFY_APP_CLIENT_ID: "client-id",
  SHOP_DOMAIN: "example.myshopify.com",
  WEB_URL: "https://web.example",
  API_URL: "https://api.example",
  SHOPIFY_APP_CLIENT_SECRET: "secret",
};

describe("the calendar Worker", () => {
  it("serves the page, framed only by the admin, with App Bridge first", async () => {
    const response = await handle(new Request("https://cal.example/"), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors https://example.myshopify.com https://admin.shopify.com;",
    );
    const html = await response.text();
    expect(html.indexOf("app-bridge.js")).toBeLessThan(
      html.indexOf('<script type="module">'),
    );
    expect(html).toContain('<meta name="shopify-api-key" content="client-id">');
  });

  it("refuses every API call without a valid session token", async () => {
    for (const path of ["/api/calendar", "/api/campaigns/black-friday/check"]) {
      const response = await handle(new Request(`https://cal.example${path}`), env);
      expect(response.status).toBe(401);
    }
    const forged = await handle(
      new Request("https://cal.example/api/calendar", {
        headers: { authorization: "Bearer a.b.c" },
      }),
      env,
    );
    expect(forged.status).toBe(401);
  });

  it("answers 404 off the known paths", async () => {
    expect((await handle(new Request("https://cal.example/nope"), env)).status).toBe(404);
  });
});
