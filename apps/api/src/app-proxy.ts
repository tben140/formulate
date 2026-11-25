import {
  authoriseCustomerId,
  deleteFor,
  fail,
  isResult,
  previewFor,
  type DeletionEnv,
  type DeletionResult,
} from "./account-deletion";

/**
 * Account deletion for the theme (SHO-90), through a Shopify app proxy.
 *
 * The theme has no Customer Account token to send, as web and the app do. So
 * the theme posts to its own store, `/apps/double-helix/account/deletion…`,
 * and Shopify forwards the request here, adding `logged_in_customer_id` and a
 * signature made with the Double Helix app's client secret. The app's
 * `[app_proxy]` in apps/shopify-app/shopify.app.toml maps that path to
 * `/proxy/…` on this Worker.
 *
 * ⚠️ The customer id comes ONLY from those signed parameters. Shopify sets
 * `logged_in_customer_id` from the shopper's own session and signs it, so a
 * request can't name another customer, and an unsigned one is refused.
 *
 * ⚠️ Cross-site requests. Shopify signs whatever reaches the proxy with the
 * shopper's session, including a form another site makes their browser post.
 * Deletion therefore needs a confirmation token from the preview. Only the
 * store's own page can read the preview (no CORS here), so only it can
 * confirm. The token names the customer and expires after ten minutes.
 */

export interface AppProxyEnv extends DeletionEnv {
  /**
   * The Double Helix app's client secret (Dev Dashboard), which Shopify signs
   * proxied requests with. A Cloudflare secret. Until it's set, these routes
   * answer 503 and delete nothing.
   */
  readonly SHOPIFY_APP_PROXY_SECRET?: string;
}

/** Shopify's signature covers the time it signed; older is a replay. */
const MAX_AGE_SECONDS = 5 * 60;
const CONFIRM_TOKEN_SECONDS = 10 * 60;

const encoder = new TextEncoder();

const hmacHex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/** Compares every character, so the time taken says nothing about a match. */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};

/**
 * Shopify's app proxy signature: every query parameter but `signature`,
 * sorted by name, as `name=value` (repeated names' values joined by commas),
 * concatenated with no separator, then HMAC-SHA256 in hex with the app's
 * client secret.
 *
 * Returns the signed-in customer's numeric id, `""` when nobody is signed in,
 * or null when the signature, shop or time doesn't check out.
 */
export const verifyProxyRequest = async (
  url: URL,
  secret: string,
  shop: string,
  now: number = Date.now(),
): Promise<string | null> => {
  const signature = url.searchParams.get("signature");
  if (!signature) return null;
  const values = new Map<string, string[]>();
  for (const [name, value] of url.searchParams) {
    if (name === "signature") continue;
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  const message = [...values.keys()]
    .sort()
    .map((name) => `${name}=${values.get(name)!.join(",")}`)
    .join("");
  if (!sameText(await hmacHex(secret, message), signature)) return null;

  if (url.searchParams.get("shop") !== shop) return null;
  const timestamp = Number(url.searchParams.get("timestamp"));
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > MAX_AGE_SECONDS) {
    return null;
  }
  const customerId = url.searchParams.get("logged_in_customer_id") ?? "";
  return customerId === "" || /^\d+$/.test(customerId) ? customerId : null;
};

/** `<expiry>.<hmac>`, bound to one customer and one purpose. */
export const confirmToken = async (
  secret: string,
  customerId: string,
  now: number = Date.now(),
): Promise<string> => {
  const expires = Math.floor(now / 1000) + CONFIRM_TOKEN_SECONDS;
  return `${expires}.${await hmacHex(secret, `account-deletion:${customerId}:${expires}`)}`;
};

export const checkConfirmToken = async (
  secret: string,
  customerId: string,
  token: unknown,
  now: number = Date.now(),
): Promise<boolean> => {
  if (typeof token !== "string") return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || !/^\d+$/.test(expires)) return false;
  if (Number(expires) < now / 1000) return false;
  return sameText(
    await hmacHex(secret, `account-deletion:${customerId}:${expires}`),
    mac,
  );
};

/**
 * `POST /proxy/account/deletion/preview` and `POST /proxy/account/deletion`.
 * The caller has already checked the method, the content type and the body
 * size; the rate limit is per customer, applied by the caller once the
 * customer is known, since every proxied request comes from Shopify's IPs.
 */
export const handleProxyDeletion = async (
  env: AppProxyEnv,
  url: URL,
  raw: string,
  limit: (customerId: string) => Promise<boolean>,
  now: number = Date.now(),
): Promise<
  DeletionResult | { status: 429; body: { ok: false; reason: "rate-limited" } }
> => {
  const secret = env.SHOPIFY_APP_PROXY_SECRET;
  if (!secret) {
    console.error("account deletion (theme): SHOPIFY_APP_PROXY_SECRET is not set");
    return fail(503, "not-configured");
  }
  const customerId = await verifyProxyRequest(url, secret, env.SHOPIFY_STORE_DOMAIN, now);
  if (customerId === null) return fail(403, "rejected");
  if (customerId === "") return fail(401, "unauthorized");
  if (!(await limit(customerId))) {
    return { status: 429, body: { ok: false, reason: "rate-limited" } };
  }

  const deleting = url.pathname === "/proxy/account/deletion";
  if (deleting) {
    let body: { confirm?: unknown; token?: unknown };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      return fail(400, "rejected");
    }
    if (body?.confirm !== "delete") return fail(400, "not-confirmed");
    if (!(await checkConfirmToken(secret, customerId, body.token, now))) {
      return fail(400, "not-confirmed");
    }
  }

  const customer = await authoriseCustomerId(env, customerId);
  if (isResult(customer)) return customer;
  if (deleting) return deleteFor(env, customer);

  const preview = await previewFor(env, customer, new Date(now));
  if (preview.status !== 200 || !preview.body.ok || !("subscriptions" in preview.body)) {
    return preview;
  }
  return {
    status: 200,
    body: { ...preview.body, confirmToken: await confirmToken(secret, customerId, now) },
  };
};
