/**
 * Who is calling? The routes that act for a signed-in customer (account
 * deletion, the subscription portal) take their Shopify Customer Account
 * access token in `Authorization` and ask Shopify whose it is.
 *
 * ⚠️ Shopify's answer is the ONLY source of the customer id those routes use.
 * Never take a customer id, email or record id from the request: this Worker
 * holds Admin tokens, and an id from the body would let any signed-in buyer
 * act on someone else's account.
 */

import { tryFetch } from "./try-fetch";

export interface CustomerEnv {
  /** Plain vars: they name the store, they grant nothing. */
  readonly SHOPIFY_SHOP_ID: string;
  readonly SHOPIFY_API_VERSION: string;
}

export interface VerifiedCustomer {
  /** Numeric, as Recharge's `external_customer_id` and Shopify's gid take it. */
  readonly id: string;
  readonly email: string | null;
}

/** The caller's token, or null when there isn't one. */
export const bearerToken = (request: Request): string | null =>
  request.headers.get("Authorization")?.trim() || null;

/**
 * Asked of Shopify's Customer Account API with the token itself, so only a
 * live sign-in for this shop answers.
 *
 * null means Shopify refused the token: unauthorized. "unavailable" means
 * Shopify couldn't be reached or failed (a 5xx), which says nothing about the
 * token, so callers answer 502, not 401.
 */
export const verifyCustomer = async (
  env: CustomerEnv,
  accessToken: string,
): Promise<VerifiedCustomer | null | "unavailable"> => {
  const response = await tryFetch(
    `https://shopify.com/${env.SHOPIFY_SHOP_ID}/account/customer/api/${env.SHOPIFY_API_VERSION}/graphql`,
    {
      method: "POST",
      // No "Bearer": the Customer Account API takes the bare token.
      headers: { Authorization: accessToken, "content-type": "application/json" },
      body: JSON.stringify({
        query: "{ customer { id emailAddress { emailAddress } } }",
      }),
    },
    "shopify customer check",
  );
  if (!response || response.status >= 500) return "unavailable";
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as {
    data?: {
      customer?: { id?: string; emailAddress?: { emailAddress?: string } | null };
    };
  } | null;
  const gid = body?.data?.customer?.id;
  const id = gid?.match(/^gid:\/\/shopify\/Customer\/(\d+)$/)?.[1];
  return id
    ? { id, email: body?.data?.customer?.emailAddress?.emailAddress ?? null }
    : null;
};
