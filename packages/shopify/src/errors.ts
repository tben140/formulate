/**
 * Explicit error types for Storefront API calls.
 *
 * AGENTS.md prefers explicit error types over generic catches, so `request()`
 * never throws for an expected failure — it returns a discriminated union the
 * caller must narrow. The kinds map to genuinely different remedies: fix the
 * config, retry, check the token/scope, fix the query, or tell the buyer.
 */

export interface GraphQLErrorShape {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

/**
 * A `userErrors` entry from a mutation payload.
 *
 * Shape-compatible with Shopify's `CartUserError`, but declared structurally
 * rather than imported from ./generated so this module stays independent of
 * whichever operations happen to be defined.
 */
export interface UserErrorShape {
  readonly message: string;
  readonly field?: readonly string[] | null;
  readonly code?: string | null;
}

export type StorefrontError =
  /** Missing or malformed domain/token/version — a developer mistake. */
  | { readonly kind: "config"; readonly message: string }
  /** fetch() itself failed: offline, DNS, TLS. Usually worth retrying. */
  | { readonly kind: "network"; readonly message: string; readonly cause: unknown }
  /** Non-2xx. 401/403 means the token is wrong or lacks scope; 430 is throttling. */
  | { readonly kind: "http"; readonly status: number; readonly message: string }
  /** 200 with an `errors` array — the query is wrong, not the transport. */
  | { readonly kind: "graphql"; readonly errors: readonly GraphQLErrorShape[] }
  /**
   * 200, no GraphQL errors, but the mutation refused the operation and said so
   * in `userErrors`. Sold out, quantity rule violated, line id not in this cart.
   *
   * This one is different in kind from the other four: the request was
   * well-formed and the system is healthy. It is the only variant whose message
   * is ever worth showing to a buyer, and the only one a retry will not fix.
   *
   * `request()` never produces it — nothing generic can know where a given
   * payload keeps its userErrors. The cart operations in ./cart do.
   */
  | { readonly kind: "userError"; readonly errors: readonly UserErrorShape[] };

export type StorefrontResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: StorefrontError };

/** Renders any StorefrontError as a single human-readable line for logs. */
export const describeError = (error: StorefrontError): string => {
  switch (error.kind) {
    case "config":
      return `Storefront config error: ${error.message}`;
    case "network":
      return `Storefront network error: ${error.message}`;
    case "http":
      return `Storefront HTTP ${error.status}: ${error.message}`;
    case "graphql":
      return `Storefront GraphQL error: ${error.errors.map((e) => e.message).join("; ")}`;
    case "userError":
      return `Storefront rejected the operation: ${error.errors.map((e) => e.message).join("; ")}`;
  }
};
