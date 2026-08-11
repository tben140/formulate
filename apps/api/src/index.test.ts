import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

/**
 * These tests exist to pin the **security invariants**, not the happy path.
 *
 * Each one corresponds to a way this endpoint could be turned against the
 * Klaviyo account it holds a key for. A regression in any of them would still
 * subscribe people correctly, which is exactly why they need tests rather than
 * a manual check.
 */

const PRIVATE_KEY = "pk_not_a_real_key";
const LIST_ID = "XPJ8ic";

/**
 * The Durable Object is stubbed here. Its *rule* is tested exhaustively in
 * rate-limit-policy.test.ts, and the wiring between them is verified against
 * the deployed Worker — see vitest.config.ts for why not in-process.
 */
const testEnv = (allowed = true) => ({
  KLAVIYO_PRIVATE_KEY: PRIVATE_KEY,
  KLAVIYO_LIST_ID: LIST_ID,
  RATE_LIMITER: {
    idFromName: (name: string) => name,
    get: () => ({ limit: () => Promise.resolve({ success: allowed }) }),
  },
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://api.example/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const stubKlaviyo = (response: Partial<Response>) => {
  const mock = vi.fn(() => Promise.resolve(response as Response));
  vi.stubGlobal("fetch", mock);
  return mock;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Env is supplied by the pool
const run = (request: Request, e: unknown = testEnv()) => worker.fetch(request, e as any);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request shape", () => {
  it("rejects anything but POST", async () => {
    const res = await run(new Request("https://api.example/"));
    expect(res.status).toBe(405);
  });

  it("rejects a wrong content type before reading the body", async () => {
    const res = await run(post({ email: "a@b.co" }, { "content-type": "text/plain" }));
    expect(res.status).toBe(415);
  });

  it("rejects an oversized body", async () => {
    const res = await run(post(`{"email":"${"a".repeat(2000)}@b.co"}`));
    expect(res.status).toBe(413);
  });

  it("rejects malformed JSON without throwing", async () => {
    const res = await run(post("{not json"));
    expect(res.status).toBe(400);
  });
});

describe("validation", () => {
  it("rejects a bad address without contacting Klaviyo", async () => {
    const klaviyo = stubKlaviyo({ ok: true, status: 202 });
    const res = await run(post({ email: "ben@" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: "invalid-email" });
    expect(klaviyo).not.toHaveBeenCalled();
  });

  it("rejects a non-string email", async () => {
    // Otherwise an object or array reaches the payload builder.
    const res = await run(post({ email: { toString: "gotcha" } }));
    expect(res.status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("returns 429 without contacting Klaviyo", async () => {
    // The rule itself is covered in rate-limit-policy.test.ts; this only
    // checks the handler short-circuits before any upstream call.
    const klaviyo = stubKlaviyo({ ok: true, status: 202 });
    const res = await run(post({ email: "ben@example-domain.co.uk" }), testEnv(false));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "rate-limited" });
    expect(klaviyo).not.toHaveBeenCalled();
  });
});

describe("⚠️ injection resistance", () => {
  it("ignores every field except email", async () => {
    /*
     * The single most important test here. A proxy that merged the request
     * body into the upstream payload would let any caller pick the destination
     * list, set arbitrary profile properties, or forge custom_source.
     */
    const klaviyo = stubKlaviyo({ ok: true, status: 202 });

    await run(
      post({
        email: "ben@example-domain.co.uk",
        listId: "ATTACKER",
        data: { type: "evil" },
        custom_source: "spoofed",
        properties: { admin: true },
      }),
    );

    const [, init] = klaviyo.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as Record<string, never>;

    expect(JSON.stringify(sent)).not.toContain("ATTACKER");
    expect(JSON.stringify(sent)).not.toContain("spoofed");
    expect(JSON.stringify(sent)).not.toContain("admin");
  });

  it("always sends the list id from config", async () => {
    const klaviyo = stubKlaviyo({ ok: true, status: 202 });
    await run(post({ email: "ben@example-domain.co.uk", listId: "ATTACKER" }));

    const [, init] = klaviyo.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as {
      data: { relationships: { list: { data: { id: string } } } };
    };
    expect(sent.data.relationships.list.data.id).toBe(LIST_ID);
  });
});

describe("⚠️ information disclosure", () => {
  it("never returns Klaviyo's error body", async () => {
    // "List not found" is true information about our configuration. Handing it
    // to an anonymous caller turns this into a disclosure endpoint.
    const upstream = '{"errors":[{"detail":"List not found"}]}';
    stubKlaviyo({ ok: false, status: 400, text: () => Promise.resolve(upstream) });

    const res = await run(post({ email: "ben@example-domain.co.uk" }));
    const body = await res.text();

    expect(res.status).toBe(502);
    expect(body).not.toContain("List not found");
    expect(JSON.parse(body)).toEqual({ ok: false, reason: "rejected" });
  });

  it("never echoes the private key", async () => {
    stubKlaviyo({ ok: false, status: 401, text: () => Promise.resolve("bad key") });
    const res = await run(post({ email: "ben@example-domain.co.uk" }));
    expect(await res.text()).not.toContain(PRIVATE_KEY);
  });
});

describe("upstream call", () => {
  it("authenticates with the private key and pinned revision", async () => {
    const klaviyo = stubKlaviyo({ ok: true, status: 202 });
    await run(post({ email: "ben@example-domain.co.uk" }));

    const [url, init] = klaviyo.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(url).toContain("/api/profile-subscription-bulk-create-jobs");
    expect(headers["Authorization"]).toBe(`Klaviyo-API-Key ${PRIVATE_KEY}`);
    expect(headers["content-type"]).toBe("application/vnd.api+json");
  });

  it("returns 202 on success", async () => {
    stubKlaviyo({ ok: true, status: 202 });
    const res = await run(post({ email: "ben@example-domain.co.uk" }));

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("⚠️ CORS", () => {
  it("sets no CORS headers, so browsers cannot use it cross-origin", async () => {
    // Deliberate. A native caller needs none, and their absence means an
    // application/json POST fails its preflight from any other origin.
    stubKlaviyo({ ok: true, status: 202 });
    const res = await run(post({ email: "ben@example-domain.co.uk" }));

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
