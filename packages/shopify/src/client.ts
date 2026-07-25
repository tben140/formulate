import type { TypedDocumentString } from "./generated/graphql";
import type { GraphQLErrorShape, StorefrontResult } from "./errors";

/**
 * A minimal Storefront API client.
 *
 * Deliberately built on bare `fetch` with no Shopify runtime dependency, so
 * this module runs unchanged in Node (Next.js RSC), the browser, and Hermes
 * (React Native). Anything DOM-flavoured — hydrogen-react's <Image>, <Money>,
 * ShopPayButton — belongs in apps/web, not here.
 */

export interface StorefrontClientConfig {
  /** e.g. "tben140plus-xcorpito.myshopify.com" — no protocol, no trailing slash. */
  readonly domain: string;
  /** The PUBLIC Storefront access token. Never an Admin API token. */
  readonly token: string;
  /** e.g. "2026-04". Must match the schema codegen ran against. */
  readonly apiVersion: string;
}

export interface StorefrontClient {
  readonly request: <TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    variables?: TVariables,
  ) => Promise<StorefrontResult<TResult>>;
}

interface GraphQLResponseBody<T> {
  readonly data?: T;
  readonly errors?: readonly GraphQLErrorShape[];
}

export const createStorefrontClient = (
  config: StorefrontClientConfig,
): StorefrontClient => {
  const request = async <TResult, TVariables>(
    document: TypedDocumentString<TResult, TVariables>,
    variables?: TVariables,
  ): Promise<StorefrontResult<TResult>> => {
    const { domain, token, apiVersion } = config;

    if (!domain || !token || !apiVersion) {
      return {
        ok: false,
        error: {
          kind: "config",
          message:
            "Missing Storefront credentials. Check SHOPIFY_STORE_DOMAIN, " +
            "SHOPIFY_STOREFRONT_TOKEN and SHOPIFY_API_VERSION in your .env.local.",
        },
      };
    }

    const url = `https://${domain}/api/${apiVersion}/graphql.json`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Storefront-Access-Token": token,
        },
        body: JSON.stringify({ query: document.toString(), variables }),
      });
    } catch (cause) {
      return {
        ok: false,
        error: {
          kind: "network",
          message: cause instanceof Error ? cause.message : "fetch failed",
          cause,
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: "http",
          status: response.status,
          message: await response.text().catch(() => response.statusText),
        },
      };
    }

    const body = (await response.json()) as GraphQLResponseBody<TResult>;

    if (body.errors?.length) {
      return { ok: false, error: { kind: "graphql", errors: body.errors } };
    }

    if (!body.data) {
      return {
        ok: false,
        error: {
          kind: "graphql",
          errors: [{ message: "Response contained neither data nor errors." }],
        },
      };
    }

    return { ok: true, data: body.data };
  };

  return { request };
};
