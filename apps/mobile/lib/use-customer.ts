import {
  createCartClient,
  CUSTOMER_ORDER_QUERY,
  CUSTOMER_ORDERS_QUERY,
  describeCustomerAccountError,
  describeError,
  orderGid,
  type CustomerOrderResult,
  type CustomerOrdersResult,
} from "@formulate/shopify";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { clearCartId, readCartId } from "./cart-storage";
import {
  clearCustomerTokens,
  isCustomerAccountAvailable,
  readCustomerTokens,
  requestAsCustomer,
  signIn,
  signOut,
} from "./customer-account";
import {
  clearRechargeSession,
  isRechargeConfigured,
  loadPortal,
  loadSubscription,
} from "./recharge";
import { storefront } from "./storefront";

/**
 * The signed-in buyer, as TanStack Query state (SHO-70). Web renders the same
 * data from Server Components; this is the app's equivalent of its pages.
 */

const cartClient = createCartClient(storefront);

const CUSTOMER_KEY = ["customer"] as const;

/** Thrown for anything a retry might fix. Signed out is not an error: it's `null`. */
const loadError = () =>
  new Error("We couldn't load your account just now. Please try again.");

/**
 * Runs a Customer Account query, or returns null when there's no usable
 * session. A 401 means Shopify ended the session (signed out elsewhere, or
 * revoked), so the tokens are dropped and the screen shows "Sign in".
 */
const queryAsCustomer = async <TData>(
  query: string,
  variables: Record<string, unknown>,
): Promise<TData | null> => {
  const result = await requestAsCustomer<TData>(query, variables);
  if (!result) return null;
  if (result.ok) return result.data;

  if (result.error.kind === "http" && result.error.status === 401) {
    await clearCustomerTokens();
    return null;
  }
  if (__DEV__) console.warn(describeCustomerAccountError(result.error));
  throw loadError();
};

/** The buyer and their latest orders, or null when signed out. */
export const useCustomerOrders = () =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "orders"],
    queryFn: () =>
      queryAsCustomer<CustomerOrdersResult>(CUSTOMER_ORDERS_QUERY, { first: 20 }),
    enabled: isCustomerAccountAvailable,
  });

/** One order. Another buyer's id comes back as `order: null`, the API's own scoping. */
export const useCustomerOrder = (pathId: string) =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "order", pathId],
    queryFn: () => {
      const gid = orderGid(pathId);
      return gid
        ? queryAsCustomer<CustomerOrderResult>(CUSTOMER_ORDER_QUERY, { id: gid })
        : null;
    },
    enabled: isCustomerAccountAvailable,
  });

/** Whether tokens are stored, for deciding what to show before any request. */
export const useHasCustomerSession = () =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "session"],
    queryFn: async () => (await readCustomerTokens()) !== null,
    enabled: isCustomerAccountAvailable,
  });

export const useSignIn = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const outcome = await signIn();

      if (outcome.kind === "signed-in") {
        // Attach the cart built while signed out, so checkout opens signed in
        // with saved addresses. Same reasoning as web's /account/authorize: a
        // failure here leaves the buyer signed in, and checkout still asks.
        const cartId = await readCartId();
        if (cartId) {
          const attached = await cartClient.setBuyerIdentity(cartId, {
            customerAccessToken: outcome.tokens.accessToken,
          });
          if (!attached.ok && __DEV__) console.warn(describeError(attached.error));
        }
      }
      return outcome;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CUSTOMER_KEY }),
  });
};

export const useSignOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await signOut();
      clearRechargeSession();
      // ⚠️ The cart goes too: it was attached to this buyer at sign-in, so the
      // next person to use the phone would otherwise check out as them.
      await clearCartId();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CUSTOMER_KEY });
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
};

/**
 * The subscription portal (SHO-72). Disabled until a Recharge Storefront token
 * is configured; the screens say so rather than showing an empty list.
 */
export const usePortal = () =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "portal"],
    queryFn: loadPortal,
    enabled: isCustomerAccountAvailable && isRechargeConfigured,
  });

export const useSubscription = (id: string) =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "subscription", id],
    queryFn: () => loadSubscription(id),
    enabled: isCustomerAccountAvailable && isRechargeConfigured,
  });
