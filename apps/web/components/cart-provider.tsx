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
   * This site's origin (`siteUrl.origin`, lib/site.ts), threaded down from the
   * server so Klaviyo payloads carry product URLs on the public site: a flow
   * email links to whatever is in `URL`. A preview deployment resolves to
   * production's origin, which is the right place for an email to point.
   */
  readonly siteOrigin: string;
}

const CartUiContext = createContext<CartUiValue | null>(null);

export const CartProvider = ({
  children,
  siteOrigin,
}: {
  children: ReactNode;
  siteOrigin: string;
}) => {
  const [open, setOpen] = useState(false);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openCart, closeCart, siteOrigin }),
    [open, openCart, closeCart, siteOrigin],
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

/**
 * The cart drawer's heading. A suggestion add hands focus to it, because the
 * button that had focus leaves the list (see cart-suggestions.tsx).
 */
export const CART_DRAWER_TITLE_ID = "cart-drawer-title";
