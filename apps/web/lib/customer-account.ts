import {
  DEFAULT_API_VERSION,
  isTokenExpiring,
  type AuthCrypto,
  type CustomerAccountConfig,
  type CustomerTokens,
} from "@formulate/shopify";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Customer sign-in for the web app: configuration and where the tokens live
 * (SHO-70).
 *
 * The tokens are kept in an **httpOnly** cookie, the same reasoning as the
 * cart id in ./cart.ts: they are bearer credentials, so client JavaScript
 * never sees them, and every call to Shopify happens on the server.
 * `apps/mobile` keeps its tokens in the keychain instead (ADR 0005: parity is
 * design, not data).
 *
 * ⚠️ The cookie holds the tokens themselves, unencrypted. httpOnly, Secure and
 * SameSite keep them away from scripts and other sites; what they don't stop
 * is someone with the browser's cookie jar. That's the same exposure as
 * Shopify's own session cookie on the hosted account pages, and encrypting
 * would add a server secret to rotate for no change in that threat.
 */

/** Neither value is secret, but nothing in the browser needs them either. */
export const customerAccountConfig: CustomerAccountConfig = {
  shopId: process.env.SHOPIFY_SHOP_ID ?? "",
  clientId: process.env.SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? "",
  apiVersion: process.env.SHOPIFY_CUSTOMER_ACCOUNT_API_VERSION ?? DEFAULT_API_VERSION,
};

/** False on a deployment without the env vars: the account link still works, and explains. */
export const isCustomerAccountConfigured = Boolean(
  customerAccountConfig.shopId && customerAccountConfig.clientId,
);

/** Web Crypto, which Node 22 has globally. */
export const webAuthCrypto: AuthCrypto = {
  randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
  sha256: (data) => crypto.subtle.digest("SHA-256", data),
};

const SESSION_COOKIE = "formulate_customer";
const PENDING_COOKIE = "formulate_customer_auth";

/**
 * How long the session cookie outlives the access token: the refresh token is
 * what keeps a buyer signed in across visits. If Shopify has expired the
 * refresh token sooner, the refresh fails and they're asked to sign in again,
 * which is the right outcome either way.
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/** Ten minutes to get through Shopify's sign-in, email code included. */
const PENDING_MAX_AGE = 60 * 10;

const cookieOptions = (maxAge: number) =>
  ({
    httpOnly: true,
    // Lax, not Strict: the callback is a top-level navigation *from*
    // shopify.com, and Strict would withhold the pending cookie from exactly
    // that request.
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }) as const;

const isTokens = (value: unknown): value is CustomerTokens => {
  if (!value || typeof value !== "object") return false;
  const tokens = value as Record<string, unknown>;
  return (
    typeof tokens.accessToken === "string" &&
    typeof tokens.refreshToken === "string" &&
    typeof tokens.idToken === "string" &&
    typeof tokens.expiresAt === "number"
  );
};

const parseJson = (value: string | undefined): unknown => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/** The signed-in buyer's tokens, or null. Malformed cookies count as signed out. */
export const readCustomerTokens = async (): Promise<CustomerTokens | null> => {
  const value = parseJson((await cookies()).get(SESSION_COOKIE)?.value);
  return isTokens(value) ? value : null;
};

/** Only callable from a Route Handler or Server Action. */
export const writeCustomerTokens = async (tokens: CustomerTokens): Promise<void> => {
  (await cookies()).set(
    SESSION_COOKIE,
    JSON.stringify(tokens),
    cookieOptions(SESSION_MAX_AGE),
  );
};

export const clearCustomerTokens = async (): Promise<void> => {
  (await cookies()).delete(SESSION_COOKIE);
};

/** What must survive the round trip to Shopify's sign-in page. */
export interface PendingSignIn {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
}

export const writePendingSignIn = async (pending: PendingSignIn): Promise<void> => {
  (await cookies()).set(
    PENDING_COOKIE,
    JSON.stringify(pending),
    cookieOptions(PENDING_MAX_AGE),
  );
};

/** Reads and deletes in one go: each sign-in attempt can be completed once. */
export const takePendingSignIn = async (): Promise<PendingSignIn | null> => {
  const jar = await cookies();
  const value = parseJson(jar.get(PENDING_COOKIE)?.value);
  jar.delete(PENDING_COOKIE);

  if (!value || typeof value !== "object") return null;
  const pending = value as Record<string, unknown>;
  return typeof pending.state === "string" &&
    typeof pending.nonce === "string" &&
    typeof pending.codeVerifier === "string" &&
    typeof pending.returnTo === "string"
    ? {
        state: pending.state,
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
        returnTo: pending.returnTo,
      }
    : null;
};

/**
 * A same-site path to come back to after signing in, or `/account`.
 *
 * ⚠️ `return_to` comes from the URL, so without this check `/account/login`
 * would be an open redirect: a link to our domain that lands the buyer on
 * someone else's, just after they've signed in and trust it most. `//evil.com`
 * and `/\evil.com` are both treated as other hosts by browsers.
 */
export const safeReturnTo = (value: string | null | undefined): string =>
  value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/account";

/** Where Shopify sends the buyer back to. Must be registered on the client, exactly. */
export const callbackPath = "/account/authorize";

/**
 * The guard for every signed-in page: a usable access token, or a redirect.
 *
 * Signed out goes to sign in; expired goes through /account/refresh, since a
 * Server Component can't write the renewed cookie itself. Either way the buyer
 * comes back to `returnTo`.
 */
/**
 * The origin the buyer's browser is actually on.
 *
 * ⚠️ Not `request.nextUrl.origin`. Under `next start` that reported
 * `http://localhost:3210` for a request to `http://127.0.0.1:3210` (measured
 * 2026-10-06), so the callback URL named a different host from the one that
 * holds the pending cookie, and the logout Origin check refused a same-site
 * POST. The forwarded headers are what Vercel's proxy sets from the real
 * request.
 *
 * Trusting a client-supplied Host here is safe: Shopify only redirects to a
 * registered callback URL, so a forged host gets an error page at Shopify,
 * not the code.
 */
export const requestOrigin = (headers: Headers, fallback: string): string => {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return fallback;
  const proto =
    headers.get("x-forwarded-proto") ??
    (fallback.startsWith("https:") ? "https" : "http");
  return `${proto.split(",")[0]?.trim() ?? "https"}://${host.split(",")[0]?.trim()}`;
};

export const requireCustomerTokens = async (
  returnTo: string,
): Promise<CustomerTokens> => {
  const tokens = await readCustomerTokens();
  const back = encodeURIComponent(safeReturnTo(returnTo));
  if (!tokens) redirect(`/account/login?return_to=${back}`);
  if (isTokenExpiring(tokens)) redirect(`/account/refresh?return_to=${back}`);
  return tokens;
};
