import { DEFAULT_COUNTRY_CODE } from "./config";

import type { StorefrontClient } from "./client";
import type { StorefrontResult, UserErrorShape } from "./errors";
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
  }) => Promise<StorefrontResult<Cart>>;

  readonly addLines: (
    cartId: string,
    lines: readonly CartLineInput[],
  ) => Promise<StorefrontResult<Cart>>;

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

export const createCartClient = (storefront: StorefrontClient): CartClient => ({
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
});

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
