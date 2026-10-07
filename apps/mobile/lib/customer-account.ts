import {
  callbackParams,
  createAuthorizationRequest,
  customerAccountRequest,
  DEFAULT_API_VERSION,
  describeCustomerAccountError,
  exchangeCode,
  isTokenExpiring,
  logoutUrl,
  refreshTokens,
  type AuthCrypto,
  type CustomerAccountConfig,
  type CustomerAccountResult,
  type CustomerTokens,
} from "@formulate/shopify";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

/**
 * Customer sign-in for the app (SHO-70): the same Customer Account API flow as
 * apps/web, through `packages/shopify/src/customer-account.ts`, with the
 * platform parts native.
 *
 * | | Web | App |
 * | --- | --- | --- |
 * | Browser hand-off | redirect | `openAuthSessionAsync` (a system sheet) |
 * | Callback | `https://…/account/authorize` | `shop.<shop id>.app://callback` |
 * | Tokens | httpOnly cookie | keychain (expo-secure-store) |
 * | Randomness, SHA-256 | Web Crypto | expo-crypto (Hermes has no `crypto.subtle`) |
 *
 * ⚠️ The callback scheme is Shopify's rule for native clients, and it is why
 * this can't be tested in Expo Go: Expo Go can only receive `exp://` links.
 * It needs a development build with the scheme in app.config.ts.
 */

/** Both public by design: the shop id is in the store's discovery document, the client id on every sign-in URL. */
export const customerAccountConfig: CustomerAccountConfig = {
  shopId: process.env.EXPO_PUBLIC_SHOPIFY_SHOP_ID ?? "",
  clientId: process.env.EXPO_PUBLIC_SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID ?? "",
  apiVersion: process.env.EXPO_PUBLIC_SHOPIFY_API_VERSION ?? DEFAULT_API_VERSION,
};

/**
 * False without the env vars, and on web: the Expo web build has no keychain
 * (expo-secure-store has no web implementation), and the website has its own
 * sign-in.
 */
export const isCustomerAccountAvailable =
  Platform.OS !== "web" &&
  Boolean(customerAccountConfig.shopId && customerAccountConfig.clientId);

/** Shopify requires `shop.<shop id>.app://` for native clients. Registered on the client in Shopify admin. */
export const redirectUri = `shop.${customerAccountConfig.shopId}.app://callback`;

const appAuthCrypto: AuthCrypto = {
  randomBytes: (length) => Crypto.getRandomBytes(length),
  sha256: (data) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data),
};

/*
 * One keychain entry per token rather than one JSON blob: Android's secure
 * store warns above 2,048 bytes per value, and the id token alone is a JWT of
 * around a kilobyte.
 */
const KEYS = {
  accessToken: "formulate.customer.access",
  refreshToken: "formulate.customer.refresh",
  idToken: "formulate.customer.id",
  expiresAt: "formulate.customer.expires",
} as const;

export const readCustomerTokens = async (): Promise<CustomerTokens | null> => {
  const [accessToken, refreshToken, idToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(KEYS.accessToken),
    SecureStore.getItemAsync(KEYS.refreshToken),
    SecureStore.getItemAsync(KEYS.idToken),
    SecureStore.getItemAsync(KEYS.expiresAt),
  ]);
  const expiry = Number(expiresAt);
  return accessToken && refreshToken && idToken && Number.isFinite(expiry)
    ? { accessToken, refreshToken, idToken, expiresAt: expiry }
    : null;
};

const writeCustomerTokens = async (tokens: CustomerTokens): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken),
    SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken),
    SecureStore.setItemAsync(KEYS.idToken, tokens.idToken),
    SecureStore.setItemAsync(KEYS.expiresAt, String(tokens.expiresAt)),
  ]);
};

export const clearCustomerTokens = async (): Promise<void> => {
  await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
};

export type SignInOutcome =
  | { readonly kind: "signed-in"; readonly tokens: CustomerTokens }
  /** The buyer closed the sheet. Not an error, and not worth a message. */
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed" };

/**
 * Runs a sign-in from start to finish.
 *
 * Unlike web, nothing has to survive a page load: state, nonce and verifier
 * stay in this function's scope while the sheet is open, so nothing pending is
 * ever written to storage.
 */
export const signIn = async (): Promise<SignInOutcome> => {
  const request = await createAuthorizationRequest(
    customerAccountConfig,
    { redirectUri, locale: "en" },
    appAuthCrypto,
  );
  if (!request.ok) {
    console.warn(describeCustomerAccountError(request.error));
    return { kind: "failed" };
  }

  /*
   * An ephemeral session: no cookies shared with Safari, in either direction.
   * Each sign-in asks for the email code again, and in exchange signing out of
   * the app really does sign out. A shared session would keep the buyer signed
   * in at shopify.com in Safari after they'd signed out here.
   */
  const result = await WebBrowser.openAuthSessionAsync(request.data.url, redirectUri, {
    preferEphemeralSession: true,
  });
  if (result.type !== "success") return { kind: "cancelled" };

  // Not `new URL()`: see callbackParams for what React Native's does to codes.
  const params = callbackParams(result.url);
  const code = params.code;
  // `state` is the CSRF check: a callback must answer the request this
  // function made, not one an attacker started.
  if (params.error || !code || params.state !== request.data.state) {
    return { kind: "failed" };
  }

  const tokens = await exchangeCode(customerAccountConfig, {
    code,
    codeVerifier: request.data.codeVerifier,
    redirectUri,
    nonce: request.data.nonce,
  });
  if (!tokens.ok) {
    console.warn(describeCustomerAccountError(tokens.error));
    return { kind: "failed" };
  }

  await writeCustomerTokens(tokens.data);
  return { kind: "signed-in", tokens: tokens.data };
};

/**
 * Tokens that are good to use now: renewed first when about to expire, or
 * null when there's no session (or it can no longer be renewed).
 */
export const getUsableTokens = async (): Promise<CustomerTokens | null> => {
  const tokens = await readCustomerTokens();
  if (!tokens) return null;
  if (!isTokenExpiring(tokens)) return tokens;

  const refreshed = await refreshTokens(customerAccountConfig, tokens);
  if (!refreshed.ok) {
    console.warn(describeCustomerAccountError(refreshed.error));
    await clearCustomerTokens();
    return null;
  }
  await writeCustomerTokens(refreshed.data);
  return refreshed.data;
};

/**
 * Ends the session at Shopify, then forgets it here.
 *
 * Mobile clients have no post-logout redirect: Shopify answers the logout URL
 * directly, so a plain request is enough. A failure there is logged, not
 * shown. The tokens are gone from this device either way, which is what the
 * buyer asked for.
 */
export const signOut = async (): Promise<void> => {
  const tokens = await readCustomerTokens();
  await clearCustomerTokens();
  if (!tokens) return;
  try {
    await fetch(logoutUrl(customerAccountConfig, { idToken: tokens.idToken }));
  } catch (cause) {
    console.warn("Shopify logout request failed", cause);
  }
};

/** A Customer Account API query with whatever tokens are usable now. */
export const requestAsCustomer = async <TData>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<CustomerAccountResult<TData> | null> => {
  const tokens = await getUsableTokens();
  if (!tokens) return null;
  return customerAccountRequest<TData>(
    customerAccountConfig,
    tokens.accessToken,
    query,
    variables,
  );
};
