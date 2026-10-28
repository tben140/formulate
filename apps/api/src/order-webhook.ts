import {
  POSTHOG_CAPTURE_URL,
  orderCompletedEvent,
  type WebhookOrder,
} from "@formulate/analytics";

/**
 * Shopify's orders/create webhook → PostHog `order_completed` (SHO-88).
 *
 * The browser's checkout pixel sends the same event when it can; this makes
 * sure an order is counted when it can't. Both use the order's fixed event id,
 * so PostHog keeps one event, and Shopify's retries (it retries any non-2xx)
 * can't double-count.
 *
 * ⚠️ Public URL, so nothing happens before the signature checks out: an HMAC
 * of the raw body with the app's client secret, compared by
 * `crypto.subtle.verify`, which doesn't leak timing.
 */

export interface OrderWebhookEnv {
  /** The webhook-owning app's client secret (`wrangler secret put`). */
  readonly SHOPIFY_WEBHOOK_SECRET?: string;
  /** PostHog's public project key. Unset: orders are accepted and not sent. */
  readonly POSTHOG_KEY?: string;
}

/** An order webhook is a few KB; well past any real order. */
const MAX_ORDER_BYTES = 256 * 1024;

const base64ToBytes = (value: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

export const verifyShopifyHmac = async (
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> => {
  const bytes = base64ToBytes(signature);
  if (!bytes) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
};

export const handleOrderWebhook = async (
  request: Request,
  env: OrderWebhookEnv,
): Promise<Response> => {
  const status = (code: number) => new Response(null, { status: code });
  if (!env.SHOPIFY_WEBHOOK_SECRET) return status(503);
  if (request.headers.get("x-shopify-topic") !== "orders/create") return status(400);
  const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";

  const raw = await request.text();
  if (raw.length > MAX_ORDER_BYTES) return status(413);
  if (!(await verifyShopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, raw, signature)))
    return status(401);

  let order: WebhookOrder;
  try {
    order = JSON.parse(raw) as WebhookOrder;
  } catch {
    return status(400);
  }

  const event = env.POSTHOG_KEY ? orderCompletedEvent(order, env.POSTHOG_KEY) : null;
  // No analytics id on the cart (no consent), or no key: nothing to send.
  if (!event) return status(200);

  const response = await fetch(POSTHOG_CAPTURE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });
  // A failed send makes Shopify retry later; the fixed event id makes that safe.
  return status(response.ok ? 200 : 502);
};
