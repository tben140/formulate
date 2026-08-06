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
}

const CartUiContext = createContext<CartUiValue | null>(null);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openCart, closeCart }),
    [open, openCart, closeCart],
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
