/**
 * Explicit error types for Storefront API calls.
 *
 * CLAUDE.md prefers explicit error types over generic catches, so `request()`
 * never throws for an expected failure — it returns a discriminated union the
 * caller must narrow. The four kinds map to genuinely different remedies:
 * fix the config, retry, check the token/scope, or fix the query.
 */

export interface GraphQLErrorShape {
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export type StorefrontError =
  /** Missing or malformed domain/token/version — a developer mistake. */
  | { readonly kind: "config"; readonly message: string }
  /** fetch() itself failed: offline, DNS, TLS. Usually worth retrying. */
  | { readonly kind: "network"; readonly message: string; readonly cause: unknown }
  /** Non-2xx. 401/403 means the token is wrong or lacks scope; 430 is throttling. */
  | { readonly kind: "http"; readonly status: number; readonly message: string }
  /** 200 with an `errors` array — the query is wrong, not the transport. */
  | { readonly kind: "graphql"; readonly errors: readonly GraphQLErrorShape[] };

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
  }
};
