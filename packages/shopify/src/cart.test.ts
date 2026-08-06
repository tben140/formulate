import { describe, expect, it } from "vitest";

import { isCartId } from "./cart";

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
