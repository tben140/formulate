"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Whether the cart drawer is open.
 *
 * This is the only piece of cart state that lives on the client. The cart
 * *contents* are server state, fetched in the root layout and passed down as
 * props — so there is no client-side cache to keep in step, and no moment where
 * the drawer and the header count can disagree.
 */

interface CartUiValue {
  readonly open: boolean;
  readonly openCart: () => void;
  readonly closeCart: () => void;
  /**
   * The Online Store domain, threaded down from the server.
   *
   * Klaviyo payloads must carry Online Store product URLs so email links work
   * whichever surface fired the event. Passing it here keeps
   * `SHOPIFY_STORE_DOMAIN` server-only rather than adding a `NEXT_PUBLIC_`
   * twin of a variable the repo deliberately keeps private.
   */
  readonly storeDomain: string;
}

const CartUiContext = createContext<CartUiValue | null>(null);

export const CartProvider = ({
  children,
  storeDomain,
}: {
  children: ReactNode;
  storeDomain: string;
}) => {
  const [open, setOpen] = useState(false);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openCart, closeCart, storeDomain }),
    [open, openCart, closeCart, storeDomain],
  );

  return <CartUiContext value={value}>{children}</CartUiContext>;
};

export const useCartUi = (): CartUiValue => {
  const value = useContext(CartUiContext);
  if (!value) {
    throw new Error("useCartUi must be used inside <CartProvider>.");
  }
  return value;
};
