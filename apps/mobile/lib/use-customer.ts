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
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { deleteAccount, previewDeletion } from "./account-deletion";
import { clearCartId, readCartId } from "./cart-storage";
import {
  clearCustomerTokens,
  isCustomerAccountAvailable,
  readCustomerTokens,
  requestAsCustomer,
  TransientRefreshError,
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
  let result: Awaited<ReturnType<typeof requestAsCustomer<TData>>>;
  try {
    result = await requestAsCustomer<TData>(query, variables);
  } catch (cause) {
    // Renewing failed but the session isn't over: retryable, not signed out.
    if (cause instanceof TransientRefreshError) throw loadError();
    throw cause;
  }
  if (!result) return null;
  if (result.ok) return result.data;

  if (result.error.kind === "http" && result.error.status === 401) {
    await clearCustomerTokens();
    return null;
  }
  if (__DEV__) console.warn(describeCustomerAccountError(result.error));
  throw loadError();
};

const ORDERS_KEY = [...CUSTOMER_KEY, "orders"] as const;

/** The buyer and their latest orders, or null when signed out. */
export const useCustomerOrders = () => {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: ORDERS_KEY,
    queryFn: async ({ pageParam }) => {
      const page = await queryAsCustomer<CustomerOrdersResult>(CUSTOMER_ORDERS_QUERY, {
        first: 20,
        after: pageParam,
      });
      // A later page that finds the session gone (a 401 cleared the tokens)
      // mustn't leave the earlier pages, and the last buyer's orders, on
      // screen: start the query over, which now resolves to signed out.
      if (page === null && pageParam !== undefined) {
        queueMicrotask(() => void queryClient.resetQueries({ queryKey: ORDERS_KEY }));
      }
      return page;
    },
    initialPageParam: undefined as string | undefined,
    // Older orders, one cursor page at a time ("Load more" on the Account tab).
    getNextPageParam: (last) =>
      last?.customer.orders.pageInfo.hasNextPage
        ? (last.customer.orders.pageInfo.endCursor ?? undefined)
        : undefined,
    enabled: isCustomerAccountAvailable,
  });
};

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
    // reset, not invalidate: drops every cached customer query, inactive ones
    // included, so nothing from a previous session is ever shown.
    onSuccess: () => queryClient.resetQueries({ queryKey: CUSTOMER_KEY }),
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
      // reset, not invalidate: invalidating only refetches active queries, and
      // an inactive one (an order screen visited earlier) would keep this
      // buyer's data in memory for the next person on the phone.
      await queryClient.resetQueries({ queryKey: CUSTOMER_KEY });
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

/** What deleting the account would cancel (SHO-90). Fresh each visit: no caching. */
export const useDeletionPreview = () =>
  useQuery({
    queryKey: [...CUSTOMER_KEY, "deletion-preview"],
    queryFn: previewDeletion,
    staleTime: 0,
    gcTime: 0,
  });

/**
 * Deletes the account through the Worker. On success, everything sign-out
 * forgets is forgotten here too: tokens, Recharge session and the cart. No
 * Shopify logout request: the account it would end is being erased.
 */
export const useDeleteAccount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await deleteAccount();
      if (!result.ok) return { result, cleanupFailed: false };
      // The account is gone whatever happens next, so that result stands.
      // Every cleanup step is tried even if one fails (SecureStore can reject),
      // and a failure is reported alongside, never instead.
      const steps = await Promise.allSettled([
        clearCustomerTokens(),
        Promise.resolve().then(clearRechargeSession),
        clearCartId(),
      ]);
      const cleanupFailed = steps.some((step) => step.status === "rejected");
      if (cleanupFailed && __DEV__) console.warn("deletion cleanup failed", steps);
      return { result, cleanupFailed };
    },
    onSuccess: async ({ result }) => {
      if (!result.ok) return;
      await queryClient.resetQueries({ queryKey: CUSTOMER_KEY });
      await queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
  });
};
