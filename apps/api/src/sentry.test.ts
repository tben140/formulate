import { afterEach, describe, expect, it, vi } from "vitest";

import { envelope, parseDsn, reportError, scrub } from "./sentry";

const DSN = "https://abc123@o1.ingest.de.sentry.io/42";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDsn", () => {
  it("finds the envelope endpoint and key", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o1.ingest.de.sentry.io/api/42/envelope/",
      key: "abc123",
    });
  });

  it("refuses anything else", () => {
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("http://abc@host/42")).toBeNull();
    expect(parseDsn("https://host/42")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });
});

describe("envelope", () => {
  const now = new Date("2026-11-03T12:00:00Z");

  it("carries the message, level, exception and extras, and nothing about the request", () => {
    const error = new TypeError("boom");
    const body = envelope(
      { message: "Uncaught error", level: "error", error, extra: { status: 502 } },
      DSN,
      now,
      "e".repeat(32),
    );
    const [header, item, eventLine] = body.split("\n");
    expect(JSON.parse(header!)).toMatchObject({ event_id: "e".repeat(32), dsn: DSN });
    expect(JSON.parse(item!)).toEqual({ type: "event" });
    const event = JSON.parse(eventLine!);
    expect(event).toMatchObject({
      level: "error",
      environment: "production",
      message: { formatted: "Uncaught error" },
      extra: { status: 502 },
    });
    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "boom" });
    expect(event.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
    for (const key of ["request", "user", "breadcrumbs", "contexts"])
      expect(event[key]).toBeUndefined();
  });

  it("never carries an email address, even inside an error message", () => {
    const body = envelope(
      {
        message: "failed for ada@example.com",
        level: "error",
        error: new SyntaxError('Unexpected token, "ada@example.com" is not valid JSON'),
        extra: { detail: "ada@example.com" },
      },
      DSN,
      now,
      "e".repeat(32),
    );
    expect(body).not.toContain("ada@example.com");
    expect(body).toContain("[email]");
    expect(scrub("x".repeat(1000)).length).toBe(300);
  });
});

describe("reportError", () => {
  it("posts the envelope in the background, with Sentry's auth header", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    vi.stubGlobal("fetch", fetch);
    const pending: Promise<unknown>[] = [];
    reportError(
      DSN,
      { waitUntil: (p) => pending.push(p) },
      { message: "m", level: "error" },
    );
    await Promise.all(pending);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://o1.ingest.de.sentry.io/api/42/envelope/");
    expect((init.headers as Record<string, string>)["x-sentry-auth"]).toContain(
      "sentry_key=abc123",
    );
  });

  it("does nothing without a DSN, and ignores a failed send", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetch);
    const pending: Promise<unknown>[] = [];
    reportError(
      undefined,
      { waitUntil: (p) => pending.push(p) },
      { message: "m", level: "error" },
    );
    expect(fetch).not.toHaveBeenCalled();
    reportError(
      DSN,
      { waitUntil: (p) => pending.push(p) },
      { message: "m", level: "error" },
    );
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });
});
