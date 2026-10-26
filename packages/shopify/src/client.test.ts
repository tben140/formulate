import { afterEach, describe, expect, it, vi } from "vitest";

import { createStorefrontClient } from "./client";
import { TypedDocumentString } from "./generated/graphql";

/**
 * The Storefront client turns every way a request can go wrong into one of
 * the typed errors in errors.ts, so callers handle each by its remedy and
 * never see a thrown exception. Each test is one of those ways.
 */

const config = {
  domain: "shop.myshopify.com",
  token: "public-storefront-token",
  apiVersion: "2026-04",
};

const query = new TypedDocumentString<{ shop: { name: string } }, { first: number }>(
  "query Shop { shop { name } }",
);

const respond = (body: unknown, init: ResponseInit = {}) => {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(
      new Response(typeof body === "string" ? body : JSON.stringify(body), init),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("createStorefrontClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the query and variables to the store's versioned endpoint", async () => {
    const fetchMock = respond({ data: { shop: { name: "Double Helix" } } });

    const result = await createStorefrontClient(config).request(query, { first: 3 });

    expect(result).toEqual({ ok: true, data: { shop: { name: "Double Helix" } } });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://shop.myshopify.com/api/2026-04/graphql.json",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "query Shop { shop { name } }",
          variables: { first: 3 },
        }),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": "public-storefront-token",
    });
  });

  it.each(["domain", "token", "apiVersion"] as const)(
    "is a config error, with no request, when %s is missing",
    async (missing) => {
      const fetchMock = respond({});
      const result = await createStorefrontClient({ ...config, [missing]: "" }).request(
        query,
      );

      expect(result).toMatchObject({ ok: false, error: { kind: "config" } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("is a network error when fetch itself fails", async () => {
    const cause = new TypeError("fetch failed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(cause)),
    );

    const result = await createStorefrontClient(config).request(query);

    expect(result).toEqual({
      ok: false,
      error: { kind: "network", message: "fetch failed", cause },
    });
  });

  it("is an http error, with Shopify's message, on a non-2xx status", async () => {
    respond("Invalid API key or access token", { status: 401 });

    const result = await createStorefrontClient(config).request(query);

    expect(result).toEqual({
      ok: false,
      error: { kind: "http", status: 401, message: "Invalid API key or access token" },
    });
  });

  it("is a graphql error when the response lists errors", async () => {
    const errors = [{ message: "Field 'nope' doesn't exist on type 'Shop'" }];
    respond({ errors });

    const result = await createStorefrontClient(config).request(query);

    expect(result).toEqual({ ok: false, error: { kind: "graphql", errors } });
  });

  it("is a graphql error when the response has neither data nor errors", async () => {
    respond({});

    const result = await createStorefrontClient(config).request(query);

    expect(result).toMatchObject({ ok: false, error: { kind: "graphql" } });
  });
});
