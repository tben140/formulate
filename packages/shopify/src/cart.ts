import { DEFAULT_COUNTRY_CODE } from "./config";

import type { StorefrontClient } from "./client";
import type { StorefrontError, StorefrontResult, UserErrorShape } from "./errors";
import type {
  CartBuyerIdentityInput,
  CartFieldsFragment,
  CartLineInput,
  CartLineUpdateInput,
  CountryCode,
} from "./generated/graphql";

import {
  CartBuyerIdentityUpdateMutation,
  CartCreateMutation,
  CartLinesAddMutation,
  CartLinesRemoveMutation,
  CartLinesUpdateMutation,
  CartQuery,
} from "./queries";

/**
 * Cart operations over the shared Storefront client.
 *
 * This is the one piece of substantial shared *logic* in the workspace — the
 * rest of packages/shopify is a client plus query documents. It lives here
 * rather than in an app because all three surfaces would otherwise reimplement
 * the same userErrors handling, and get it subtly differently.
 *
 * What is deliberately NOT here:
 *
 *   - **Persistence.** Where a cart id is kept differs genuinely per surface —
 *     httpOnly cookie on web, the OS keychain on native, Shopify's own cookie
 *     in the Liquid theme. An interface spanning all three would fit none.
 *   - **Optimistic state.** That belongs next to the renderer that has to roll
 *     it back.
 *   - **The Liquid theme.** It uses Shopify's AJAX Cart API and never touches
 *     this module at all. See docs/adr/0005-parity-means-design-not-data.md.
 *
 * Every mutation returns the complete cart, so a response is directly usable as
 * the new state. No refetch, and no opportunity for the mutation and query
 * shapes to disagree.
 */

/** The cart as every surface sees it. Shaped by the CartFields fragment. */
export type Cart = CartFieldsFragment;

/**
 * A mutation payload, structurally. Every Shopify cart mutation returns this
 * pair, so one narrowing helper serves all of them.
 */
interface CartMutationPayload {
  readonly cart?: Cart | null;
  readonly userErrors: readonly UserErrorShape[];
}

/**
 * Collapses a mutation payload into the same Result the rest of the package
 * returns.
 *
 * Order matters. `userErrors` is checked **before** `cart`, because Shopify
 * returns both on a partial failure — a cart in its pre-mutation state
 * alongside the reason the change was refused. Reading `cart` first would
 * treat "sold out" as success and quietly show stale contents.
 */
const fromPayload = (
  payload: CartMutationPayload | null | undefined,
): StorefrontResult<Cart> => {
  if (!payload) {
    return {
      ok: false,
      error: {
        kind: "graphql",
        errors: [{ message: "Cart mutation returned no payload." }],
      },
    };
  }

  if (payload.userErrors.length > 0) {
    return { ok: false, error: { kind: "userError", errors: payload.userErrors } };
  }

  if (!payload.cart) {
    return {
      ok: false,
      error: {
        kind: "graphql",
        errors: [{ message: "Cart mutation returned neither a cart nor userErrors." }],
      },
    };
  }

  return { ok: true, data: payload.cart };
};

export interface AddLinesOutcome {
  readonly result: StorefrontResult<Cart>;
  /**
   * True when the id passed in no longer resolves: expired, completed at
   * checkout, or tampered with. Always true in that case, even if the
   * replacement cart could not be created, because the old id is useless
   * either way.
   */
  readonly storedCartGone: boolean;
}

export interface CartClient {
  /**
   * Fetches a cart by id.
   *
   * ⚠️ `cartId` must be the COMPLETE identifier including the `?key=` suffix.
   * See `isCartId` for exactly what is lost without it.
   *
   * Resolves to `{ ok: true, data: null }` for a cart that no longer exists —
   * most often because it was completed at checkout. That is an ordinary
   * outcome, not a failure, so callers should clear their stored id and carry
   * on rather than surfacing an error.
   */
  readonly get: (cartId: string) => Promise<StorefrontResult<Cart | null>>;

  /**
   * Creates a cart, optionally with lines already in it.
   *
   * `countryCode` defaults to DEFAULT_COUNTRY_CODE. Do not omit it by passing
   * `undefined` explicitly expecting Shopify to infer one — it will not, and
   * checkout silently defaults to the United States.
   */
  readonly create: (options?: {
    readonly lines?: readonly CartLineInput[];
    readonly countryCode?: CountryCode;
    /**
     * The buyer's email, when one is already known.
     *
     * ⚠️ This is what makes an abandoned cart *attributable*. Shopify only
     * records an abandoned checkout it can act on once it has an address, and
     * without this the shopper has to type one at the contact step — so anyone
     * who leaves before that is invisible to a Klaviyo abandoned cart flow,
     * even when we already know exactly who they are.
     *
     * Setting it here also pre-fills Shopify's checkout, which is the same fact
     * seen from the shopper's side.
     */
    readonly email?: string;
  }) => Promise<StorefrontResult<Cart>>;

  readonly addLines: (
    cartId: string,
    lines: readonly CartLineInput[],
  ) => Promise<StorefrontResult<Cart>>;

  /**
   * Adds lines to the stored cart, starting a new one if there is none or the
   * stored one has gone. This is the add-to-cart every surface should call.
   *
   * ⚠️ Only a cart Shopify says **no longer exists** is replaced (see
   * `isCartGone`). A network blip, an HTTP error or a rejected line leaves the
   * stored cart alone and returns the error, because the cart is still fine —
   * throwing it away would silently lose everything the shopper had added.
   *
   * A dead cart is recovered within this one call, so the shopper's first
   * attempt succeeds rather than failing and making them try again.
   *
   * On success, persist `result.data.id` whatever it is (it is new when the old
   * cart had gone). On failure, clear the stored id only when `storedCartGone`.
   */
  readonly addLinesOrCreate: (options: {
    readonly cartId: string | null;
    readonly lines: readonly CartLineInput[];
    /**
     * Resolves the buyer's email for a new cart. A function rather than a value
     * because it is only needed when a cart is created, and on mobile reading
     * it goes through the Klaviyo SDK. See `create` for why it matters.
     */
    readonly email?: () => Promise<string | null | undefined>;
  }) => Promise<AddLinesOutcome>;

  readonly updateLines: (
    cartId: string,
    lines: readonly CartLineUpdateInput[],
  ) => Promise<StorefrontResult<Cart>>;

  readonly removeLines: (
    cartId: string,
    lineIds: readonly string[],
  ) => Promise<StorefrontResult<Cart>>;

  /** Corrects the country on an existing cart, and later attaches a customer. */
  readonly setBuyerIdentity: (
    cartId: string,
    buyerIdentity: CartBuyerIdentityInput,
  ) => Promise<StorefrontResult<Cart>>;
}

export const createCartClient = (storefront: StorefrontClient): CartClient => {
  const client: Omit<CartClient, "addLinesOrCreate"> = {
    get: async (cartId) => {
      const result = await storefront.request(CartQuery, { id: cartId });
      return result.ok ? { ok: true, data: result.data.cart ?? null } : result;
    },

    create: async (options) => {
      const result = await storefront.request(CartCreateMutation, {
        input: {
          lines: options?.lines ? [...options.lines] : undefined,
          buyerIdentity: {
            countryCode: options?.countryCode ?? (DEFAULT_COUNTRY_CODE as CountryCode),
            // Omitted rather than sent empty — Shopify rejects "" as an address.
            ...(options?.email ? { email: options.email } : {}),
          },
        },
      });
      return result.ok ? fromPayload(result.data.cartCreate) : result;
    },

    addLines: async (cartId, lines) => {
      const result = await storefront.request(CartLinesAddMutation, {
        cartId,
        lines: [...lines],
      });
      return result.ok ? fromPayload(result.data.cartLinesAdd) : result;
    },

    updateLines: async (cartId, lines) => {
      const result = await storefront.request(CartLinesUpdateMutation, {
        cartId,
        lines: [...lines],
      });
      return result.ok ? fromPayload(result.data.cartLinesUpdate) : result;
    },

    removeLines: async (cartId, lineIds) => {
      const result = await storefront.request(CartLinesRemoveMutation, {
        cartId,
        lineIds: [...lineIds],
      });
      return result.ok ? fromPayload(result.data.cartLinesRemove) : result;
    },

    setBuyerIdentity: async (cartId, buyerIdentity) => {
      const result = await storefront.request(CartBuyerIdentityUpdateMutation, {
        cartId,
        buyerIdentity,
      });
      return result.ok ? fromPayload(result.data.cartBuyerIdentityUpdate) : result;
    },
  };

  return {
    ...client,

    addLinesOrCreate: async ({ cartId, lines, email }) => {
      if (cartId) {
        const added = await client.addLines(cartId, lines);
        if (added.ok || !isCartGone(added.error)) {
          return { result: added, storedCartGone: false };
        }
      }

      const created = await client.create({
        lines,
        email: (await email?.()) ?? undefined,
      });
      return { result: created, storedCartGone: cartId !== null };
    },
  };
};

/**
 * Whether a failed cart mutation failed because the cart itself no longer
 * exists — as opposed to anything else, after which the cart is still fine.
 *
 * Measured against the live store on 2026-09-26. Four different ways of losing
 * a cart produced the same answer from `cartLinesAdd` and `cartLinesUpdate`:
 *
 * | Stored id | Response |
 * | --- | --- |
 * | made up, well-formed | `userErrors: [{ code: "INVALID", field: ["cartId"], message: "The specified cart does not exist." }]` |
 * | real, `?key=` stripped | same |
 * | real, wrong key | same |
 * | completed at checkout | same |
 *
 * ⚠️ **Match the field, not the code.** A line Shopify refuses is also
 * `INVALID`, on `["lines", "0", "merchandiseId"]` — and after that the cart is
 * perfectly healthy. Matching the code alone would discard a shopper's cart
 * whenever one product in it went unavailable.
 *
 * Everything that is not a `userError` is transient or a developer mistake —
 * network, HTTP, GraphQL, config — and says nothing about the cart at all.
 */
export const isCartGone = (error: StorefrontError): boolean =>
  error.kind === "userError" &&
  error.errors.some((entry) => entry.field?.length === 1 && entry.field[0] === "cartId");

/**
 * Whether a string is a complete cart id — meaning it still carries its `?key=`.
 *
 * Shopify returns cart ids as `gid://shopify/Cart/{token}?key={secret}`. The
 * key is part of the identifier, not a query parameter to be tidied away.
 *
 * What actually happens without it, measured against the live store on
 * 2026-08-05 rather than taken from folklore:
 *
 * | Field | Correct key | No key | Wrong key |
 * | --- | --- | --- | --- |
 * | lines, note, attributes, totalQuantity, cost, checkoutUrl | returned | returned | returned |
 * | `buyerIdentity.email` | returned | **null** | **null** |
 *
 * So the cart itself resolves perfectly well; it is the **buyer's personal
 * data** that is gated. That is a sensible design — the key is what proves the
 * caller is the buyer who owns this cart, and a cart token alone is guessable
 * enough that leaking an email address off it would be a real problem.
 *
 * Two consequences worth keeping:
 *
 *   1. **The failure is silent in both directions.** A missing key and a wrong
 *      key both return 200 with a valid-looking cart and no error of any kind.
 *      Nothing tells you the email vanished.
 *   2. **It breaks things that look unrelated.** Checkout email prefill and any
 *      Klaviyo identification keyed off the cart's email both degrade, while
 *      every test asserting on line items keeps passing.
 *
 * Hence checking on the way in. Cookie and keychain values outlive deploys, so
 * a truncated id written once keeps coming back long after the code that wrote
 * it is gone.
 */
export const isCartId = (value: string): boolean =>
  value.startsWith("gid://shopify/Cart/") && value.includes("?key=");
