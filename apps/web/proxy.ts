import { createCartServerHandlers, handleShopifyRoutes } from "@shopify/hydrogen";
import { NextResponse, type NextRequest } from "next/server";

import { createHydrogenClient } from "@/lib/hydrogen";
import { createSessionManager } from "@/lib/hydrogen-session";

/**
 * SHO-170 spike: Hydrogen's request handlers, before Next's routing.
 *
 * Gives web a same-origin Storefront API proxy (`/api/{version}/graphql.json`),
 * `/checkout`, cart permalinks and Shopify's backend session cookies, which
 * the analytics bus needs. Cart handlers are registered only so the trial can
 * test Hydrogen's cart (`/api/cart`); the store's own cart still runs on our
 * Server Actions. No Customer Account handlers: our /account flow (#76) is
 * separate and not in this trial.
 */
const cartHandlers = createCartServerHandlers();

const SFAPI_PATH = /^\/api\/[^/]+\/graphql\.json$/;

/**
 * Hydrogen's Storefront API proxy forwards the browser's own token header and
 * never adds one (sfapi-proxy.mjs). Shopify's consent script calls it without
 * a token, which a password-protected dev store refuses ("Online Store channel
 * is locked"). Adding ours here keeps it on the server; it's the public token,
 * so this grants nothing the store doesn't already allow tokenless.
 */
const withStorefrontToken = (request: NextRequest): Request => {
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  if (!token || !SFAPI_PATH.test(request.nextUrl.pathname)) return request;
  if (request.headers.has("x-shopify-storefront-access-token")) return request;
  const headers = new Headers(request.headers);
  headers.set("x-shopify-storefront-access-token", token);
  return new Request(request, { headers });
};

export function proxy(nextRequest: NextRequest) {
  const request = withStorefrontToken(nextRequest);
  const { requestContext, storefrontClient } = createHydrogenClient(request);

  const shopifyRoute = handleShopifyRoutes({
    request,
    requestContext,
    sessionManager: createSessionManager(nextRequest),
    storefrontClient,
    handlers: [cartHandlers],
  });
  if (shopifyRoute) return shopifyRoute;

  const response = NextResponse.next({
    request: { headers: requestContext.getForwardedRequestHeaders() },
  });
  requestContext.applyResponseHeaders(response.headers);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico).*)"],
};
