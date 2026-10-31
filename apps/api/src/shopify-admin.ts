/**
 * An Admin API access token for this store, from the app's own credentials.
 *
 * The "Formulate Worker" app is made in Shopify's Dev Dashboard, which issues
 * no permanent token. Instead the Worker exchanges the app's Client ID and
 * Client secret for a token (the "client credentials grant"), valid for 24
 * hours, and asks again when it runs out. This grant only works for an app
 * and a store in the same Shopify organization.
 *
 * Cached in the isolate's memory and renewed five minutes before expiry. A
 * new isolate simply asks again: one extra request, never a stale token.
 */

export interface ShopifyAdminEnv {
  /** Plain var: the store's *.myshopify.com domain. */
  readonly SHOPIFY_STORE_DOMAIN: string;
  /** Secrets, from the app's App settings → Credentials in the Dev Dashboard. */
  readonly SHOPIFY_CLIENT_ID?: string;
  readonly SHOPIFY_CLIENT_SECRET?: string;
}

const RENEW_MARGIN_MS = 5 * 60 * 1000;

let cached: {
  readonly token: string;
  readonly expiresAt: number;
  readonly forClient: string;
} | null = null;

/** For tests: forget the cached token. */
export const resetAdminTokenCache = (): void => {
  cached = null;
};

export const hasAdminCredentials = (env: ShopifyAdminEnv): boolean =>
  Boolean(env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET);

/** A usable Admin API token, or null when Shopify won't issue one. */
export const adminAccessToken = async (
  env: ShopifyAdminEnv,
  now: number = Date.now(),
): Promise<string | null> => {
  const clientId = env.SHOPIFY_CLIENT_ID ?? "";
  if (
    cached &&
    cached.forClient === clientId &&
    cached.expiresAt - RENEW_MARGIN_MS > now
  ) {
    return cached.token;
  }

  const response = await fetch(
    `https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: env.SHOPIFY_CLIENT_SECRET ?? "",
        grant_type: "client_credentials",
      }),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  } | null;

  if (!response.ok || !body?.access_token) {
    // Shopify's error code only (e.g. shop_not_permitted when the app and the
    // store aren't in the same organization); never the secret or a token.
    console.error("shopify admin token request failed", {
      status: response.status,
      error: body?.error ?? null,
    });
    cached = null;
    return null;
  }

  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 86399) * 1000,
    forClient: clientId,
  };
  return cached.token;
};
