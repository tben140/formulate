import { describe, expect, it, vi } from "vitest";

import { createCartClient, isCartId } from "./cart";

/**
 * The behaviour `isCartId` guards is invisible at runtime — a truncated id
 * returns 200 with a valid-looking cart and no error — so the guard itself is
 * the only thing that can fail loudly. It needs to be right.
 *
 * Behaviour measured against the live store on 2026-08-05:
 * a missing OR wrong key nulls `buyerIdentity.email` while everything else
 * returns normally.
 */

const TOKEN = "hWNFJdtNYMY5SR85qnjLSobr";
const KEY = "15dc779d89b2b104786f1e37e5046250";
const COMPLETE = `gid://shopify/Cart/${TOKEN}?key=${KEY}`;

describe("isCartId", () => {
  it("accepts a complete id as Shopify issues it", () => {
    expect(isCartId(COMPLETE)).toBe(true);
  });

  it("rejects an id whose key has been stripped", () => {
    // The exact failure this exists for: somebody 'tidied away' the query
    // string, and checkout email prefill quietly stopped working.
    expect(isCartId(`gid://shopify/Cart/${TOKEN}`)).toBe(false);
  });

  it("rejects a bare token with no gid prefix", () => {
    expect(isCartId(TOKEN)).toBe(false);
  });

  it("rejects an empty string", () => {
    // What an unset cookie or an empty keychain entry reads back as.
    expect(isCartId("")).toBe(false);
  });

  it("rejects a gid for a different resource", () => {
    expect(isCartId(`gid://shopify/Order/1001?key=${KEY}`)).toBe(false);
  });

  it("rejects a cart id carrying some other query parameter", () => {
    expect(isCartId(`gid://shopify/Cart/${TOKEN}?foo=bar`)).toBe(false);
  });
});

describe("create — buyerIdentity.email", () => {
  /**
   * ⚠️ These pin an *attribution* property, not a functional one. A cart
   * created without an email works perfectly: same lines, same totals, same
   * checkout. What it cannot do is let Shopify record an abandoned checkout
   * anyone can be emailed about — so a regression here would be invisible
   * everywhere except a lifecycle flow quietly reaching nobody.
   */
  const request = (data: unknown) =>
    vi.fn(() => Promise.resolve({ ok: true as const, data }));

  const payload = {
    cartCreate: { cart: { id: "gid://shopify/Cart/x?key=y" }, userErrors: [] },
  };

  it("sends the email when one is known", async () => {
    const req = request(payload);
    await createCartClient({ request: req } as never).create({
      lines: [],
      email: "ben@example-domain.co.uk",
    });

    const [, vars] = req.mock.calls[0] as unknown as [unknown, { input: { buyerIdentity: Record<string, unknown> } }];
    expect(vars.input.buyerIdentity.email).toBe("ben@example-domain.co.uk");
  });

  it("omits the field entirely when the shopper is anonymous", async () => {
    // Not `email: ""` — Shopify rejects an empty string as an address, which
    // would fail cart creation for every shopper who has not signed up.
    const req = request(payload);
    await createCartClient({ request: req } as never).create({ lines: [] });

    const [, vars] = req.mock.calls[0] as unknown as [unknown, { input: { buyerIdentity: Record<string, unknown> } }];
    expect(vars.input.buyerIdentity).not.toHaveProperty("email");
  });

  it("still sets the country code, which is not optional in practice", () => {
    // Regression guard: adding email must not displace the country, or checkout
    // silently defaults to the United States on a GBP store.
    const req = request(payload);
    void createCartClient({ request: req } as never).create({ email: "a@b.co" });

    const [, vars] = req.mock.calls[0] as unknown as [unknown, { input: { buyerIdentity: Record<string, unknown> } }];
    expect(vars.input.buyerIdentity.countryCode).toBe("GB");
  });
});
