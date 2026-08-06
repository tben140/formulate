import { isCartId } from "@formulate/shopify";
import * as SecureStore from "expo-secure-store";

/**
 * Where the cart id lives on device.
 *
 * The OS keychain, not AsyncStorage. The id carries a `?key=` secret that gates
 * the buyer's own email address on the cart, so it is a bearer token rather
 * than a public identifier — the same reasoning that puts it in an httpOnly
 * cookie on web.
 *
 * The two surfaces reach that conclusion independently and share no
 * abstraction, because the mechanisms have nothing in common: one is a header
 * the browser attaches, the other is an async keychain call. See
 * docs/adr/0005-parity-means-design-not-data.md.
 */

const CART_KEY = "formulate.cart.id";

/**
 * Reads the stored cart id, rejecting anything malformed.
 *
 * `isCartId` is not defensive programming for its own sake. An id that has lost
 * its `?key=` still resolves — same lines, same totals, no error — and only the
 * buyer's email goes missing. Keychain entries survive app updates, so one bad
 * value written once would keep coming back long after the bug was fixed.
 * Treating it as no cart and starting fresh is the recoverable outcome.
 */
export const readCartId = async (): Promise<string | null> => {
  const value = await SecureStore.getItemAsync(CART_KEY);
  return value && isCartId(value) ? value : null;
};

export const writeCartId = (id: string): Promise<void> =>
  SecureStore.setItemAsync(CART_KEY, id);

export const clearCartId = (): Promise<void> => SecureStore.deleteItemAsync(CART_KEY);
