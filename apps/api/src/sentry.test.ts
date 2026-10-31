import { beforeEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

/**
 * ⚠️ What the Worker sends to Sentry when tracing.
 *
 * The real Worker runs with a (fake) DSN. Sentry posts its envelopes through
 * the same global fetch as the Klaviyo call, so one mock sees both.
 *
 * In its own file, with one fetch mock for the whole file: the SDK wraps the
 * global fetch the first time it starts, and only then. Swapping the mock
 * per test (as index.test.ts does) would drop the wrapper.
 */

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const IP = "203.0.113.7";
const EMAIL = "ben@example-domain.co.uk";

const env = {
  KLAVIYO_PRIVATE_KEY: "pk_not_a_real_key",
  KLAVIYO_LIST_ID: "XPJ8ic",
  RATE_LIMITER: {
    idFromName: (name: string) => name,
    get: () => ({ limit: () => Promise.resolve({ success: true }) }),
  },
  SENTRY_DSN: "https://public@o1.ingest.de.sentry.io/1",
};

const sent = vi.fn((url: string, init?: RequestInit) => {
  void url;
  void init;
  return Promise.resolve(new Response(null, { status: 202 }));
});
// Sentry only wraps a fetch that looks native ("[native code]"), so the mock
// says it is. Without this the SDK leaves fetch alone, no outgoing span or
// header is ever made, and the propagation test passes whatever the config.
Object.defineProperty(sent, "toString", {
  value: () => "function fetch() { [native code] }",
});
vi.stubGlobal("fetch", sent);

beforeEach(() => {
  sent.mockClear();
});

const fromTheApp = () =>
  new Request("https://api.example/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sentry-trace": `${TRACE_ID}-b7ad6b7169203331-1`,
      baggage: `sentry-trace_id=${TRACE_ID},sentry-sampled=true`,
      "CF-Connecting-IP": IP,
      "user-agent": "DoubleHelix/1.0 iPhone",
    },
    body: JSON.stringify({ email: EMAIL }),
  });

type Context = {
  waitUntil: (p: Promise<unknown>) => void;
  passThroughOnException: () => void;
  props: object;
};
const fetchWithContext = worker.fetch as (
  request: Request,
  env: unknown,
  context: Context,
) => Promise<Response>;

/** Runs one request and waits for Sentry to flush. */
const run = async () => {
  const pending: Promise<unknown>[] = [];
  const res = await fetchWithContext(fromTheApp(), env, {
    waitUntil: (p) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
  });
  await Promise.all(pending);
  const calls = sent.mock.calls.map(([url, init]) => ({ url: String(url), init }));
  return {
    res,
    envelopes: calls
      .filter(({ url }) => url.includes("ingest.de.sentry.io"))
      .map(({ init }) => String(init?.body)),
    klaviyo: calls.find(({ url }) => url.includes("klaviyo")),
  };
};

describe("⚠️ Sentry traces", () => {
  it("joins the app's trace, following its sampling decision", async () => {
    const { res, envelopes } = await run();
    expect(res.status).toBe(202);
    const transaction = envelopes.find((body) => body.includes('"type":"transaction"'));
    expect(transaction).toContain(TRACE_ID);
  });

  it("sends no email, IP address or user agent", async () => {
    const { envelopes } = await run();
    expect(envelopes.length).toBeGreaterThan(0);
    for (const body of envelopes) {
      expect(body).not.toContain(EMAIL);
      expect(body).not.toContain(IP);
      expect(body).not.toContain("DoubleHelix/1.0");
    }
  });

  it("adds no trace headers to the Klaviyo call", async () => {
    const { klaviyo } = await run();
    expect(klaviyo).toBeDefined();
    const headers = new Headers(klaviyo?.init?.headers);
    expect(headers.get("sentry-trace")).toBeNull();
    expect(headers.get("baggage")).toBeNull();
    expect(headers.get("traceparent")).toBeNull();
  });
});
