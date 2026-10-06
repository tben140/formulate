/**
 * Shopify's Customer Account API: sign-in, tokens and the buyer's own data
 * (SHO-70).
 *
 * The OAuth half (authorisation URL, code exchange, refresh, logout) and the
 * GraphQL half (orders) are both here so web and mobile agree on every
 * parameter. What differs per platform stays in the app: where the tokens are
 * kept (an httpOnly cookie on web, the keychain on iOS), how the browser is
 * opened, and where randomness and SHA-256 come from. Hermes has no
 * `crypto.subtle`, so those are passed in rather than reached for.
 *
 * Both platforms are **public clients**: there is no client secret anywhere,
 * so PKCE is what stops a stolen authorisation code being redeemed.
 */

/**
 * Not secret, and not the Storefront token. The client id is printed on the
 * authorisation URL every shopper's browser visits.
 */
export interface CustomerAccountConfig {
  /** The numeric shop id, e.g. "100581966136". */
  readonly shopId: string;
  /** From Shopify admin: Headless (or Hydrogen) → Customer Account API. */
  readonly clientId: string;
  /** Customer Account API version, e.g. "2026-04". Versioned separately from the Storefront API. */
  readonly apiVersion: string;
}

/** The buyer's tokens. Every value is a bearer credential: never log one. */
export interface CustomerTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Needed again at logout, as `id_token_hint`. */
  readonly idToken: string;
  /** Epoch milliseconds. */
  readonly expiresAt: number;
}

export type CustomerAccountError =
  /** Shop id or client id missing: the feature isn't configured here. */
  | { readonly kind: "config"; readonly message: string }
  | { readonly kind: "network"; readonly message: string; readonly cause: unknown }
  /**
   * Non-2xx. From the token endpoint, 400 `invalid_grant` means the code or
   * refresh token is spent or expired: sign in again. From GraphQL, 401 means
   * the access token is.
   */
  | { readonly kind: "http"; readonly status: number; readonly message: string }
  /** 2xx, but not the shape OAuth or GraphQL promises. */
  | { readonly kind: "invalid-response"; readonly message: string }
  /** The id token isn't for this shop, this client or this sign-in attempt. */
  | { readonly kind: "invalid-id-token"; readonly message: string }
  | {
      readonly kind: "graphql";
      readonly errors: readonly { readonly message: string }[];
    };

export type CustomerAccountResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CustomerAccountError };

/** One line for logs. Deliberately never includes a token. */
export const describeCustomerAccountError = (error: CustomerAccountError): string => {
  switch (error.kind) {
    case "config":
      return `Customer Account config error: ${error.message}`;
    case "network":
      return `Customer Account network error: ${error.message}`;
    case "http":
      return `Customer Account HTTP ${error.status}: ${error.message}`;
    case "invalid-response":
      return `Customer Account invalid response: ${error.message}`;
    case "invalid-id-token":
      return `Customer Account id token rejected: ${error.message}`;
    case "graphql":
      return `Customer Account GraphQL error: ${error.errors.map((e) => e.message).join("; ")}`;
  }
};

/** `openid` for the id token, `email` for its email claim, and the API itself. */
export const CUSTOMER_ACCOUNT_SCOPE = "openid email customer-account-api:full";

/**
 * Where Shopify's endpoints live for a shop.
 *
 * Built from the shop id rather than fetched from
 * `/.well-known/openid-configuration` on every sign-in. The two agree: checked
 * against this store's discovery documents on 2026-10-06. Discovery would cost a
 * round trip per sign-in to learn a URL that only changes if the shop sets up
 * a custom accounts domain, and that would be a deliberate change made here.
 */
export const customerAccountEndpoints = (config: CustomerAccountConfig) => {
  const auth = `https://shopify.com/authentication/${config.shopId}`;
  return {
    issuer: auth,
    authorize: `${auth}/oauth/authorize`,
    token: `${auth}/oauth/token`,
    logout: `${auth}/logout`,
    graphql: `https://shopify.com/${config.shopId}/account/customer/api/${config.apiVersion}/graphql`,
  } as const;
};

const missingConfig = (config: CustomerAccountConfig): CustomerAccountError | null =>
  config.shopId && config.clientId && config.apiVersion
    ? null
    : {
        kind: "config",
        message:
          "Missing shop id, client id or API version for the Customer Account API.",
      };

/**
 * The query parameters of an OAuth callback URL, as a plain record.
 *
 * Not `new URL(...).searchParams`: React Native's polyfill (0.86) splits each
 * pair on every `=`, so a value containing one (padded base64, which an
 * authorisation code is free to be) would arrive truncated, and the exchange
 * would fail with nothing to show why. This splits on the first `=` only, and
 * works on any scheme, including `shop.<id>.app://`.
 */
export const callbackParams = (url: string): Readonly<Record<string, string>> => {
  const query = url.split("#")[0]?.split("?")[1] ?? "";
  const params: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const at = pair.indexOf("=");
    const decode = (part: string) => decodeURIComponent(part.replace(/\+/g, " "));
    const key = decode(at === -1 ? pair : pair.slice(0, at));
    // First value wins, as URLSearchParams.get does.
    if (!(key in params)) params[key] = at === -1 ? "" : decode(pair.slice(at + 1));
  }
  return params;
};

/** RFC 4648 §5: the URL-safe alphabet, unpadded, as OAuth and JWTs use. */
export const base64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * Decodes base64url to text, as UTF-8.
 *
 * Not `TextDecoder`: Hermes doesn't have one. An id token's email claim can
 * contain non-ASCII characters, so `atob` alone (Latin-1) would garble them.
 */
const decodeBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  let escaped = "";
  for (let i = 0; i < binary.length; i += 1) {
    escaped += `%${binary.charCodeAt(i).toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(escaped);
};

/** What each platform supplies: Web Crypto on web, expo-crypto on mobile. */
export interface AuthCrypto {
  readonly randomBytes: (length: number) => Uint8Array;
  readonly sha256: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer | Uint8Array>;
}

/** RFC 7636 §4.2: `S256`, the challenge is the hashed verifier. */
export const codeChallengeFor = async (
  verifier: string,
  crypto: Pick<AuthCrypto, "sha256">,
): Promise<string> => {
  const digest = await crypto.sha256(new TextEncoder().encode(verifier));
  return base64Url(digest instanceof Uint8Array ? digest : new Uint8Array(digest));
};

/**
 * A sign-in about to start: the URL to send the buyer to, and the three values
 * that must be kept (server-side, or in the keychain) until they come back.
 */
export interface AuthorizationRequest {
  readonly url: string;
  /** Proves the callback answers *this* request: CSRF protection on the redirect. */
  readonly state: string;
  /** Ties the id token to this request, so a replayed one is refused. */
  readonly nonce: string;
  /** The PKCE secret. Never leaves the device or server that made it. */
  readonly codeVerifier: string;
}

export const createAuthorizationRequest = async (
  config: CustomerAccountConfig,
  options: { readonly redirectUri: string; readonly locale?: string },
  crypto: AuthCrypto,
): Promise<CustomerAccountResult<AuthorizationRequest>> => {
  const configError = missingConfig(config);
  if (configError) return { ok: false, error: configError };

  // 32 random bytes is 43 base64url characters: RFC 7636's minimum verifier
  // length, and 256 bits for state and nonce.
  const state = base64Url(crypto.randomBytes(32));
  const nonce = base64Url(crypto.randomBytes(32));
  const codeVerifier = base64Url(crypto.randomBytes(32));

  const url = new URL(customerAccountEndpoints(config).authorize);
  url.searchParams.set("scope", CUSTOMER_ACCOUNT_SCOPE);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", await codeChallengeFor(codeVerifier, crypto));
  url.searchParams.set("code_challenge_method", "S256");
  if (options.locale) url.searchParams.set("locale", options.locale);

  return { ok: true, data: { url: url.toString(), state, nonce, codeVerifier } };
};

interface TokenResponseBody {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly id_token?: unknown;
  readonly expires_in?: unknown;
}

/**
 * POSTs a grant to the token endpoint.
 *
 * `origin` is the web app's own origin. Shopify checks it against the client's
 * registered JavaScript origins for web public clients; mobile has none to
 * send.
 */
const tokenRequest = async (
  config: CustomerAccountConfig,
  grant: Record<string, string>,
  origin: string | undefined,
): Promise<CustomerAccountResult<TokenResponseBody>> => {
  const configError = missingConfig(config);
  if (configError) return { ok: false, error: configError };

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (origin) headers.Origin = origin;

  let response: Response;
  try {
    response = await fetch(customerAccountEndpoints(config).token, {
      method: "POST",
      headers,
      body: new URLSearchParams({ client_id: config.clientId, ...grant }).toString(),
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
    // OAuth errors are `{ error, error_description }`: safe to log, and they
    // never echo the code or token that was sent.
    const text = await response.text().catch(() => response.statusText);
    return { ok: false, error: { kind: "http", status: response.status, message: text } };
  }

  try {
    return { ok: true, data: (await response.json()) as TokenResponseBody };
  } catch {
    return {
      ok: false,
      error: { kind: "invalid-response", message: "Token endpoint did not return JSON." },
    };
  }
};

const toTokens = (
  body: TokenResponseBody,
  now: number,
  fallback?: Pick<CustomerTokens, "idToken" | "refreshToken">,
): CustomerAccountResult<CustomerTokens> => {
  const idToken = typeof body.id_token === "string" ? body.id_token : fallback?.idToken;
  const refreshToken =
    typeof body.refresh_token === "string" ? body.refresh_token : fallback?.refreshToken;

  if (
    typeof body.access_token !== "string" ||
    typeof body.expires_in !== "number" ||
    !idToken ||
    !refreshToken
  ) {
    return {
      ok: false,
      error: {
        kind: "invalid-response",
        message:
          "Token response is missing access_token, expires_in, id_token or refresh_token.",
      },
    };
  }

  return {
    ok: true,
    data: {
      accessToken: body.access_token,
      refreshToken,
      idToken,
      expiresAt: now + body.expires_in * 1000,
    },
  };
};

interface IdTokenClaims {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly exp?: unknown;
  readonly nonce?: unknown;
  readonly email?: unknown;
}

/**
 * Reads an id token's claims, without verifying its signature.
 *
 * That is safe here, and only here: OpenID Connect Core §3.1.3.7 allows TLS
 * to stand in for the signature when the token came straight from the token
 * endpoint, which is the only place this code ever gets one. A token from
 * anywhere else (a URL, a cookie someone else wrote) must not be read with this.
 */
export const decodeIdTokenClaims = (idToken: string): IdTokenClaims | null => {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(decodeBase64Url(payload));
    return claims && typeof claims === "object" ? (claims as IdTokenClaims) : null;
  } catch {
    return null;
  }
};

/**
 * The checks that matter once the signature can be skipped: the token is from
 * this shop, for this client, unexpired, and for the sign-in that was started.
 */
export const validateIdToken = (
  config: CustomerAccountConfig,
  idToken: string,
  expected: { readonly nonce: string; readonly now: number },
): CustomerAccountResult<{ readonly email: string | null }> => {
  const fail = (message: string): CustomerAccountResult<never> => ({
    ok: false,
    error: { kind: "invalid-id-token", message },
  });

  const claims = decodeIdTokenClaims(idToken);
  if (!claims) return fail("not a readable JWT");

  if (claims.iss !== customerAccountEndpoints(config).issuer) return fail("wrong issuer");

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(config.clientId)) return fail("wrong audience");

  if (typeof claims.exp !== "number" || claims.exp * 1000 <= expected.now) {
    return fail("expired");
  }

  if (claims.nonce !== expected.nonce) return fail("nonce does not match this sign-in");

  return {
    ok: true,
    data: { email: typeof claims.email === "string" ? claims.email : null },
  };
};

/**
 * Redeems the authorisation code from the callback, and checks the id token
 * against the sign-in that was started.
 */
export const exchangeCode = async (
  config: CustomerAccountConfig,
  options: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly redirectUri: string;
    readonly nonce: string;
    readonly origin?: string;
    readonly now?: number;
  },
): Promise<CustomerAccountResult<CustomerTokens>> => {
  const now = options.now ?? Date.now();
  const result = await tokenRequest(
    config,
    {
      grant_type: "authorization_code",
      code: options.code,
      code_verifier: options.codeVerifier,
      redirect_uri: options.redirectUri,
    },
    options.origin,
  );
  if (!result.ok) return result;

  const tokens = toTokens(result.data, now);
  if (!tokens.ok) return tokens;

  const valid = validateIdToken(config, tokens.data.idToken, {
    nonce: options.nonce,
    now,
  });
  return valid.ok ? tokens : valid;
};

/**
 * Trades a refresh token for a fresh access token.
 *
 * A refresh response may omit the id token, and Shopify may or may not rotate
 * the refresh token, so whatever isn't returned is carried over from the old
 * set rather than treated as an error.
 */
export const refreshTokens = async (
  config: CustomerAccountConfig,
  tokens: CustomerTokens,
  options: { readonly origin?: string; readonly now?: number } = {},
): Promise<CustomerAccountResult<CustomerTokens>> => {
  const result = await tokenRequest(
    config,
    { grant_type: "refresh_token", refresh_token: tokens.refreshToken },
    options.origin,
  );
  if (!result.ok) return result;
  return toTokens(result.data, options.now ?? Date.now(), tokens);
};

/**
 * True when the access token has expired or will within `skewMs`.
 *
 * A minute's margin, so a token that passes this check doesn't expire on its
 * way to Shopify.
 */
export const isTokenExpiring = (
  tokens: Pick<CustomerTokens, "expiresAt">,
  now: number = Date.now(),
  skewMs = 60_000,
): boolean => tokens.expiresAt - skewMs <= now;

/**
 * Ends the session at Shopify too.
 *
 * Clearing our own cookie alone would leave the buyer signed in at
 * shopify.com, and the next "Sign in" would skip straight through without
 * asking: surprising on a shared computer, which is when people sign out.
 */
export const logoutUrl = (
  config: CustomerAccountConfig,
  options: { readonly idToken: string; readonly postLogoutRedirectUri?: string },
): string => {
  const url = new URL(customerAccountEndpoints(config).logout);
  url.searchParams.set("id_token_hint", options.idToken);
  if (options.postLogoutRedirectUri) {
    url.searchParams.set("post_logout_redirect_uri", options.postLogoutRedirectUri);
  }
  return url.toString();
};

/**
 * One Customer Account API GraphQL request.
 *
 * ⚠️ The access token goes in `Authorization` **without** a `Bearer` prefix.
 * That is Shopify's documented format for this API, and adding the prefix
 * returns 401.
 */
export const customerAccountRequest = async <TData>(
  config: CustomerAccountConfig,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<CustomerAccountResult<TData>> => {
  const configError = missingConfig(config);
  if (configError) return { ok: false, error: configError };

  let response: Response;
  try {
    response = await fetch(customerAccountEndpoints(config).graphql, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: accessToken,
      },
      body: JSON.stringify({ query, variables }),
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

  const body = (await response.json()) as {
    readonly data?: TData;
    readonly errors?: readonly { readonly message: string }[];
  };
  if (body.errors?.length)
    return { ok: false, error: { kind: "graphql", errors: body.errors } };
  if (!body.data) {
    return {
      ok: false,
      error: {
        kind: "invalid-response",
        message: "Response contained neither data nor errors.",
      },
    };
  }
  return { ok: true, data: body.data };
};
