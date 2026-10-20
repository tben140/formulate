import { describe, expect, it, vi } from "vitest";

import { createCartClient, isCartGone, isCartId } from "./cart";
import { CartCreateMutation, CartLinesAddMutation } from "./queries";

import type { StorefrontError } from "./errors";

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

    const [, vars] = req.mock.calls[0] as unknown as [
      unknown,
      { input: { buyerIdentity: Record<string, unknown> } },
    ];
    expect(vars.input.buyerIdentity.email).toBe("ben@example-domain.co.uk");
  });

  it("omits the field entirely when the shopper is anonymous", async () => {
    // Not `email: ""` — Shopify rejects an empty string as an address, which
    // would fail cart creation for every shopper who has not signed up.
    const req = request(payload);
    await createCartClient({ request: req } as never).create({ lines: [] });

    const [, vars] = req.mock.calls[0] as unknown as [
      unknown,
      { input: { buyerIdentity: Record<string, unknown> } },
    ];
    expect(vars.input.buyerIdentity).not.toHaveProperty("email");
  });

  it("still sets the country code, which is not optional in practice", () => {
    // Regression guard: adding email must not displace the country, or checkout
    // silently defaults to the United States on a GBP store.
    const req = request(payload);
    void createCartClient({ request: req } as never).create({ email: "a@b.co" });

    const [, vars] = req.mock.calls[0] as unknown as [
      unknown,
      { input: { buyerIdentity: Record<string, unknown> } },
    ];
    expect(vars.input.buyerIdentity.countryCode).toBe("GB");
  });
});

/**
 * Payloads captured from the live store on 2026-09-26, not written from the
 * docs. A made-up id, a stripped key, a wrong key and a cart completed at
 * checkout (test order #KVEHUQPIJ) all answered `cartLinesAdd` identically.
 */
const CART_GONE: StorefrontError = {
  kind: "userError",
  errors: [
    { code: "INVALID", field: ["cartId"], message: "The specified cart does not exist." },
  ],
};

/** Same code, different field: the line is bad, the cart is fine. */
const BAD_MERCHANDISE: StorefrontError = {
  kind: "userError",
  errors: [
    {
      code: "INVALID",
      field: ["lines", "0", "merchandiseId"],
      message: "The merchandise with id gid://shopify/ProductVariant/1 does not exist.",
    },
  ],
};

describe("isCartGone", () => {
  it("recognises the cart-does-not-exist error Shopify returns", () => {
    expect(isCartGone(CART_GONE)).toBe(true);
  });

  it("does not mistake a bad line for a dead cart", () => {
    // Both use code INVALID. Matching on the code alone would throw away a
    // healthy cart whenever one product in it was unavailable.
    expect(isCartGone(BAD_MERCHANDISE)).toBe(false);
  });

  it.each<StorefrontError>([
    { kind: "network", message: "fetch failed", cause: new Error("ECONNRESET") },
    { kind: "http", status: 503, message: "Service Unavailable" },
    { kind: "graphql", errors: [{ message: "Throttled" }] },
    { kind: "config", message: "Missing Storefront credentials." },
  ])("treats a $kind failure as transient, not as a dead cart", (error) => {
    expect(isCartGone(error)).toBe(false);
  });
});

describe("addLinesOrCreate", () => {
  const STORED = `gid://shopify/Cart/${TOKEN}?key=${KEY}`;
  const FRESH = "gid://shopify/Cart/fresh?key=new";
  const LINES = [{ merchandiseId: "gid://shopify/ProductVariant/42", quantity: 1 }];

  const ok = (data: unknown) => Promise.resolve({ ok: true as const, data });
  const added = ok({ cartLinesAdd: { cart: { id: STORED }, userErrors: [] } });
  const created = ok({ cartCreate: { cart: { id: FRESH }, userErrors: [] } });
  const addFails = (error: StorefrontError) =>
    error.kind === "userError"
      ? ok({ cartLinesAdd: { cart: { id: STORED }, userErrors: error.errors } })
      : Promise.resolve({ ok: false as const, error });

  /** Routes by document, so each test states what add and create answer. */
  const client = (
    onAdd: () => Promise<unknown>,
    onCreate: () => Promise<unknown> = () => created,
  ) => {
    const request = vi.fn((document: unknown) =>
      document === CartLinesAddMutation
        ? onAdd()
        : document === CartCreateMutation
          ? onCreate()
          : Promise.reject(new Error("unexpected document")),
    );
    return { request, cart: createCartClient({ request } as never) };
  };

  const calls = (request: ReturnType<typeof vi.fn>) =>
    request.mock.calls.map(([document]) =>
      document === CartLinesAddMutation ? "add" : "create",
    );

  it("adds to the stored cart and leaves it in place", async () => {
    const { request, cart } = client(() => added);
    const email = vi.fn(() => Promise.resolve("buyer@example-domain.co.uk"));

    const outcome = await cart.addLinesOrCreate({ cartId: STORED, lines: LINES, email });

    expect(outcome.result).toMatchObject({ ok: true, data: { id: STORED } });
    expect(outcome.storedCartGone).toBe(false);
    expect(calls(request)).toEqual(["add"]);
    // Only a new cart needs the address; mobile resolves it through the SDK.
    expect(email).not.toHaveBeenCalled();
  });

  it("keeps the stored cart when the network fails", async () => {
    // The bug: this used to clear the id, orphaning everything in the cart.
    const { request, cart } = client(() =>
      addFails({ kind: "network", message: "fetch failed", cause: null }),
    );

    const outcome = await cart.addLinesOrCreate({ cartId: STORED, lines: LINES });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.storedCartGone).toBe(false);
    expect(calls(request)).toEqual(["add"]);
  });

  it("keeps the stored cart when Shopify rejects the line", async () => {
    const { request, cart } = client(() => addFails(BAD_MERCHANDISE));

    const outcome = await cart.addLinesOrCreate({ cartId: STORED, lines: LINES });

    expect(outcome.result).toMatchObject({ ok: false, error: { kind: "userError" } });
    expect(outcome.storedCartGone).toBe(false);
    expect(calls(request)).toEqual(["add"]);
  });

  it("recovers a dead cart into a new one within the same add", async () => {
    // Silent recovery: the shopper's first attempt succeeds, not their second.
    const { request, cart } = client(() => addFails(CART_GONE));
    const email = vi.fn(() => Promise.resolve("buyer@example-domain.co.uk"));

    const outcome = await cart.addLinesOrCreate({ cartId: STORED, lines: LINES, email });

    expect(outcome.result).toMatchObject({ ok: true, data: { id: FRESH } });
    expect(outcome.storedCartGone).toBe(true);
    expect(calls(request)).toEqual(["add", "create"]);

    const [, vars] = request.mock.calls[1] as unknown as [
      unknown,
      { input: { lines: unknown; buyerIdentity: Record<string, unknown> } },
    ];
    expect(vars.input.lines).toEqual(LINES);
    expect(vars.input.buyerIdentity.email).toBe("buyer@example-domain.co.uk");
  });

  it("reports the dead cart even when the replacement cannot be created", async () => {
    // The stored id is useless either way, so the caller must still clear it.
    const { cart } = client(
      () => addFails(CART_GONE),
      () =>
        Promise.resolve({
          ok: false as const,
          error: { kind: "network", message: "fetch failed", cause: null },
        }),
    );

    const outcome = await cart.addLinesOrCreate({ cartId: STORED, lines: LINES });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.storedCartGone).toBe(true);
  });

  it("creates a cart when there is none yet", async () => {
    const { request, cart } = client(() => added);

    const outcome = await cart.addLinesOrCreate({ cartId: null, lines: LINES });

    expect(outcome.result).toMatchObject({ ok: true, data: { id: FRESH } });
    expect(outcome.storedCartGone).toBe(false);
    expect(calls(request)).toEqual(["create"]);
  });
});
