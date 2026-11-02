/**
 * Admin API access for the campaigns CLI, signed in as the Double Helix app
 * (apps/shopify-app) with the client credentials grant: a token that lasts a
 * day, asked for on each run and never stored or printed.
 *
 * As the app rather than with a standalone Admin token, because the campaign
 * discount Function belongs to it: only the app can create discounts on its
 * Function and write their `$app:` config.
 *
 * The secret lives in ~/.config/formulate/shopify-app.env on Ben's machine
 * (SHOPIFY_APP_CLIENT_SECRET), never in the repository, web or the app.
 */

/** 2026-07: collection rules are still `ruleSet` there (deprecated in 2026-10). */
export const API_VERSION = "2026-07";

/** The app's client id: public, as in apps/shopify-app/shopify.app.toml. */
const CLIENT_ID = "25a2aa35a50545b4b2146c5162def482";

export interface Admin {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
}

export const adminFromEnv = async (
  env: NodeJS.ProcessEnv = process.env,
): Promise<Admin> => {
  const shop = env.SHOPIFY_STORE_DOMAIN;
  const secret = env.SHOPIFY_APP_CLIENT_SECRET;
  if (!shop || !secret)
    throw new Error(
      "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_APP_CLIENT_SECRET (docs/campaigns.md, The campaigns CLI).",
    );
  const signIn = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SHOPIFY_APP_CLIENT_ID ?? CLIENT_ID,
      client_secret: secret,
    }),
  });
  // The response body may echo request details; only the status is reported.
  if (!signIn.ok)
    throw new Error(`Signing in as the app failed (HTTP ${signIn.status}).`);
  const { access_token: token } = (await signIn.json()) as { access_token: string };

  return {
    async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const response = await fetch(
        `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-shopify-access-token": token,
          },
          body: JSON.stringify({ query, variables }),
        },
      );
      const body = (await response.json()) as { data?: T; errors?: unknown };
      if (!response.ok || body.errors || !body.data)
        throw new Error(`Admin API: ${JSON.stringify(body.errors ?? response.status)}`);
      return body.data;
    },
  };
};
