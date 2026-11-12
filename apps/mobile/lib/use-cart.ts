import { CART_ATTRIBUTE_KEYS, cartAttributes } from "@formulate/analytics";
import {
  createCartClient,
  describeError,
  describeForShopper,
  optimisticCart,
  pendingLineIds,
  type Cart,
  type CartChange,
  type CartLineInput,
  type StorefrontError,
} from "@formulate/shopify";
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { clearCartId, readCartId, writeCartId } from "./cart-storage";
import { readIdentifiedEmail } from "./klaviyo";
import { analyticsDistinctId } from "./product-analytics";
import { storefront } from "./storefront";
import { subscribeToTrackingConsent, trackingConsent } from "./tracking-consent";

/**
 * The cart, as TanStack Query state.
 *
 * These hooks live in the app rather than in `packages/shopify` for the same
 * reason the product queries do: the web app fetches in Server Components and
 * would never call them. What is shared is the cart client, the query documents
 * and the generated types — the part that actually matters.
 *
 * The web app has no equivalent of this file at all. It re-renders the layout
 * after a Server Action and the cart arrives as props; there is no client cache
 * to invalidate. Same feature, genuinely different machinery.
 */

// Every cart request states the app's tracking choice (ADR 0008), so checkout
// gets visitor ids, and the pixel can credit the order, only with consent.
// Still loading counts as not answered, which Shopify is told is refused.
const cartClient = createCartClient(storefront, {
  trackingChoice: () => {
    const choice = trackingConsent();
    return choice === "loading" ? "unset" : choice;
  },
});

/** The new cart's attributes for the custom pixel, with tracking consent only. */
const newCartAttributes = () => {
  const id = analyticsDistinctId();
  return id ? cartAttributes(id, "app") : undefined;
};

const CART_KEY = ["cart"] as const;
const LINE_KEY = ["cart", "line"] as const;

interface LineChange {
  readonly lineId: string;
  readonly quantity: number;
}

/**
 * An Error whose message a shopper can read, with the developer detail logged.
 *
 * These errors surface in the UI, so they carry `describeForShopper` rather
 * than `describeError` — which names transports and ids, and reads as a crash.
 */
const shopperError = (error: StorefrontError): Error => {
  if (__DEV__) console.warn(`[cart] ${describeError(error)}`);
  return new Error(describeForShopper(error));
};

/** What an add returns: the cart, plus a note when fewer were added than asked. */
export interface AddToCartResult {
  readonly cart: Cart;
  readonly notice?: string;
}

/**
 * The current cart, or null when there isn't one.
 *
 * A completed cart resolves to null — Shopify stops returning it once the order
 * is placed. That is how the cart empties itself after checkout, and it is why
 * the stored id is cleared here rather than in a checkout callback the web app
 * never receives.
 */
export const useCart = () => {
  const queryClient = useQueryClient();
  // Shopify rebuilds `checkoutUrl` on every read with the consent stated, so a
  // changed choice refetches the cart rather than checking out on the old one.
  useEffect(
    () =>
      subscribeToTrackingConsent(
        () => void queryClient.invalidateQueries({ queryKey: CART_KEY, exact: true }),
      ),
    [queryClient],
  );
  return useQuery({
    queryKey: CART_KEY,
    queryFn: async (): Promise<Cart | null> => {
      const id = await readCartId();
      if (!id) return null;

      const result = await cartClient.get(id);
      if (!result.ok) throw shopperError(result.error);

      if (!result.data) {
        // Only if it's still the cart we asked about: an add may have made a
        // new one while this ran, and that one must stay reachable.
        if ((await readCartId()) === id) await clearCartId();
        return null;
      }
      // Without consent the cart shouldn't carry the analytics id to the
      // order. This query reruns on every consent change, so a refusal takes
      // it off here. Housekeeping, not the consent control: the order webhook
      // never reads the id (ADR 0012), and the pixel uses it only if the
      // shopper allows analytics in checkout. So a failure here doesn't stop
      // the cart showing; the next run tries again.
      const choice = trackingConsent();
      if (choice === "denied" || choice === "unset") {
        const stripped = await cartClient.removeAttributes(
          result.data,
          CART_ATTRIBUTE_KEYS,
        );
        if (stripped.ok) return stripped.data;
      }
      return result.data;
    },
    // The cart is the one thing a shopper expects to be exactly right, so it is
    // never served stale — unlike the product queries, which cache for a minute.
    staleTime: 0,
  });
};

export const useAddToCart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (line: CartLineInput): Promise<AddToCartResult> => {
      /*
       * A cart created for a shopper we already know carries their email from
       * the start, which is what lets Shopify record an *attributable*
       * abandoned checkout if they leave without buying.
       *
       * The address comes from the Klaviyo SDK rather than local storage — it
       * is the same value the SDK attaches events to, so there is one identity
       * rather than two that can drift. It is only read if a cart is created.
       *
       * ⚠️ Only a cart Shopify says no longer exists is replaced, and within
       * this same add. Any other failure keeps the stored id: the cart is still
       * fine, and clearing it would silently lose everything in it. See
       * `addLinesOrCreate` in packages/shopify (SHO-122).
       */
      const attributes = newCartAttributes();
      const { result, storedCartGone, notice } = await cartClient.addLinesOrCreate({
        cartId: await readCartId(),
        lines: [line],
        email: readIdentifiedEmail,
        // So checkout can credit the order to this shopper; consent only.
        // Without it, an id added under earlier consent comes off.
        ...(attributes ? { attributes } : { removeAttributes: CART_ATTRIBUTE_KEYS }),
      });

      if (!result.ok) {
        if (storedCartGone) await clearCartId();
        throw shopperError(result.error);
      }

      await writeCartId(result.data.id);
      return { cart: result.data, ...(notice ? { notice } : {}) };
    },
    // Every mutation returns the complete cart, so the cache is seeded directly
    // rather than invalidated — no refetch, and no window where the badge and
    // the sheet disagree.
    onSuccess: ({ cart }) => queryClient.setQueryData(CART_KEY, cart),
  });
};

export const useUpdateCartLine = () => {
  const queryClient = useQueryClient();
  /*
   * The last failure of any queued change. `mutation.error` only follows the
   * latest `mutate()`, so a first "+" failing while a second waits would show
   * nothing. Option callbacks run for every change, so the error lives here:
   * set by whichever change fails, cleared by the shopper's next change.
   */
  const [lineError, setLineError] = useState<Error | null>(null);

  const mutation = useMutation({
    mutationKey: LINE_KEY,
    // One at a time: each answer is the whole cart, and a slow early answer
    // must not land after a later one and undo it.
    scope: { id: "cart-lines" },
    mutationFn: async ({ lineId, quantity }: LineChange): Promise<Cart> => {
      const id = await readCartId();
      if (!id) throw new Error("No cart to update.");

      // Quantity zero is how Shopify expresses removal on an update, so the
      // caller never has to choose between two mutations.
      const result = await cartClient.updateLines(id, [{ id: lineId, quantity }]);
      if (!result.ok) throw shopperError(result.error);

      return result.data;
    },
    // Runs when the change is made, even while it waits its turn in the scope.
    onMutate: () => setLineError(null),
    onError: (error) => setLineError(error),
    onSuccess: (cart) => queryClient.setQueryData(CART_KEY, cart),
  });
  return { ...mutation, lineError };
};

/**
 * The cart as the shopper should see it: Shopify's last cart with the line
 * changes still in flight already applied (SHO-52, the shared
 * `optimisticCart`). A failed change drops out of the pending list, so the
 * view returns to Shopify's cart by itself; `useUpdateCartLine().lineError`
 * says why.
 */
export const useOptimisticCart = () => {
  const { data, isPending } = useCart();
  const pending = useMutationState({
    filters: { mutationKey: LINE_KEY, status: "pending" },
    select: (mutation) => mutation.state.variables as LineChange,
  });
  const state = {
    confirmed: data ?? null,
    pending: pending.map((change, index): CartChange =>
      change.quantity > 0
        ? { id: String(index), kind: "update", ...change }
        : { id: String(index), kind: "remove", lineId: change.lineId },
    ),
    error: null,
  };
  return { cart: optimisticCart(state), busy: pendingLineIds(state), isPending };
};

/** Called after checkout completes, so the next read starts a fresh cart. */
export const useClearCart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCartId,
    onSuccess: () => queryClient.setQueryData(CART_KEY, null),
  });
};

/**
 * Attaches the buyer's email to an existing cart.
 *
 * ⚠️ Covers the cart created **before** sign-up. A cart created after it picks
 * the address up in `useAddToCart`; this is the other half, and it is the
 * common case — shoppers usually add to cart and *then* subscribe.
 *
 * Without it, exactly the shoppers we know most about are the ones Shopify
 * cannot attribute an abandoned checkout to.
 *
 * Resolves rather than throwing when there is no cart, and swallows Storefront
 * failures: attribution is an enhancement to a sign-up that has already
 * succeeded, so it must never turn one into a visible error.
 */
export const useIdentifyBuyer = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (email: string): Promise<Cart | null> => {
      const trimmed = email.trim();
      const cartId = await readCartId();
      if (!trimmed || !cartId) return null;

      const result = await cartClient.setBuyerIdentity(cartId, { email: trimmed });
      return result.ok ? result.data : null;
    },
    onSuccess: (cart) => {
      if (cart) queryClient.setQueryData(CART_KEY, cart);
    },
    // Deliberately silent — see above.
    onError: () => undefined,
  });
};
