import {
  createCartClient,
  describeError,
  type Cart,
  type CartLineInput,
} from "@formulate/shopify";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clearCartId, readCartId, writeCartId } from "./cart-storage";
import { storefront } from "./storefront";

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

const cartClient = createCartClient(storefront);

const CART_KEY = ["cart"] as const;

/**
 * The current cart, or null when there isn't one.
 *
 * A completed cart resolves to null — Shopify stops returning it once the order
 * is placed. That is how the cart empties itself after checkout, and it is why
 * the stored id is cleared here rather than in a checkout callback the web app
 * never receives.
 */
export const useCart = () =>
  useQuery({
    queryKey: CART_KEY,
    queryFn: async (): Promise<Cart | null> => {
      const id = await readCartId();
      if (!id) return null;

      const result = await cartClient.get(id);
      if (!result.ok) throw new Error(describeError(result.error));

      if (!result.data) await clearCartId();
      return result.data;
    },
    // The cart is the one thing a shopper expects to be exactly right, so it is
    // never served stale — unlike the product queries, which cache for a minute.
    staleTime: 0,
  });

export const useAddToCart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (line: CartLineInput): Promise<Cart> => {
      const existingId = await readCartId();

      const result = existingId
        ? await cartClient.addLines(existingId, [line])
        : await cartClient.create({ lines: [line] });

      if (!result.ok) {
        // A stored cart can expire or have been completed, in which case
        // addLines fails against an id that no longer resolves. Clearing lets
        // the next attempt start a fresh cart rather than failing forever.
        if (existingId) await clearCartId();
        throw new Error(describeError(result.error));
      }

      await writeCartId(result.data.id);
      return result.data;
    },
    // Every mutation returns the complete cart, so the cache is seeded directly
    // rather than invalidated — no refetch, and no window where the badge and
    // the sheet disagree.
    onSuccess: (cart) => queryClient.setQueryData(CART_KEY, cart),
  });
};

export const useUpdateCartLine = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lineId,
      quantity,
    }: {
      lineId: string;
      quantity: number;
    }): Promise<Cart> => {
      const id = await readCartId();
      if (!id) throw new Error("No cart to update.");

      // Quantity zero is how Shopify expresses removal on an update, so the
      // caller never has to choose between two mutations.
      const result = await cartClient.updateLines(id, [{ id: lineId, quantity }]);
      if (!result.ok) throw new Error(describeError(result.error));

      return result.data;
    },
    onSuccess: (cart) => queryClient.setQueryData(CART_KEY, cart),
  });
};

/** Called after checkout completes, so the next read starts a fresh cart. */
export const useClearCart = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCartId,
    onSuccess: () => queryClient.setQueryData(CART_KEY, null),
  });
};
