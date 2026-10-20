import "server-only";

import {
  createShopifyRequestContext,
  createStorefrontClient,
  gql,
} from "@shopify/hydrogen";
import { cache } from "react";

/**
 * Hydrogen 2026.10's Storefront client, server-side only (ADR 0011).
 *
 * Reads the same server-only variables as lib/storefront.ts. Hydrogen's guide
 * names the token NEXT_PUBLIC_STOREFRONT_API_TOKEN; apps/web/AGENTS.md forbids
 * that, so it isn't used. It's Shopify's public token either way, but keeping
 * it off the client is our rule (ADR 0010 explains the distinction).
 */
export const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";

/** The market every request uses. One market (GB) until the US launch. */
export const I18N = { country: "GB", language: "EN" } as const;

export const createHydrogenClient = (request: Request | { headers: Headers }) => {
  const requestContext = createShopifyRequestContext({ request, i18n: I18N });
  const storefrontClient = createStorefrontClient({
    type: "public",
    requestContext,
    config: {
      storeDomain: STORE_DOMAIN,
      // Empty (as in CI builds) means none: Hydrogen rejects an empty string.
      publicStorefrontToken: process.env.SHOPIFY_STOREFRONT_TOKEN || undefined,
    },
  });
  return { requestContext, storefrontClient };
};

const SHOP_ID_QUERY = gql(`query ShopId { shop { id } }`);

/**
 * The shop's GID, which ShopifyScripts needs. Once per render.
 *
 * Never throws: it runs in the root layout, and Shopify's analytics are
 * optional, so a failed request means "no Shopify scripts on this page", not
 * "no page". Hydrogen throws on transport failures and returns GraphQL errors.
 */
export const getShopId = cache(async (): Promise<string | null> => {
  if (!STORE_DOMAIN) return null;
  try {
    const { storefrontClient } = createHydrogenClient({ headers: new Headers() });
    const result = await storefrontClient.graphql(SHOP_ID_QUERY);
    if (result.errors?.length) {
      console.error("[hydrogen] shop id query returned errors", result.errors);
    }
    return result.data?.shop.id ?? null;
  } catch (error) {
    console.error("[hydrogen] shop id query failed", error);
    return null;
  }
});
