import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { CartSheet } from "./cart-sheet";

/**
 * Whether the cart sheet is showing.
 *
 * The only client state the cart has. Contents come from TanStack Query, so
 * there is nothing here to keep in step with them — the badge and the sheet
 * read the same cache entry.
 *
 * Mirrors apps/web's components/cart-provider.tsx in role. Neither imports the
 * other: one wraps a server-rendered tree, this one owns a native Modal.
 */

interface CartUiValue {
  readonly openCart: () => void;
  readonly closeCart: () => void;
}

const CartUiContext = createContext<CartUiValue | null>(null);

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openCart, closeCart }), [openCart, closeCart]);

  return (
    <CartUiContext value={value}>
      {children}
      {/*
        Rendered once at the root rather than per screen, so adding from a
        product page shows the sheet without a navigation — and so only one
        Modal ever exists.
      */}
      <CartSheet visible={open} onClose={closeCart} />
    </CartUiContext>
  );
};

export const useCartUi = (): CartUiValue => {
  const value = use(CartUiContext);
  if (!value) throw new Error("useCartUi must be used inside <CartProvider>.");
  return value;
};
