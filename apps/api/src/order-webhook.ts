import { orderCompletedEvent, type WebhookOrder } from "@formulate/analytics";

import type { OrderBackup } from "./order-backup";

/**
 * Shopify's orders/create webhook → PostHog `order_completed` (SHO-88), as a
 * backup for the checkout pixel.
 *
 * The pixel sends the event when it runs; this makes sure an order is counted
 * when it doesn't. The event isn't sent from here: it goes to the order's
 * OrderBackup object (./order-backup.ts), which sends it ten minutes later
 * only if the pixel hasn't reported the order. So an order counts once
 * whichever way it arrives, and Shopify's retries (it retries any non-2xx)
 * keep the first event.
 *
 * ⚠️ Public URL, so nothing happens before the signature checks out: an HMAC
 * of the raw body with the app's client secret, compared by
 * `crypto.subtle.verify`, which doesn't leak timing.
 */

export interface OrderWebhookEnv {
  /** The webhook-owning app's client secret (`wrangler secret put`). */
  readonly SHOPIFY_WEBHOOK_SECRET?: string;
  /**
   * PostHog's public project key. Unset: orders without an analytics id are
   * accepted; consented ones get 503, so Shopify retries them once it's set.
   */
  readonly POSTHOG_KEY?: string;
  /** One object per order: waits for the pixel, then sends if it must. */
  readonly ORDER_BACKUP: DurableObjectNamespace<OrderBackup>;
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

/**
 * The body as text, or null past `limit` bytes. The URL is public and this
 * runs before the signature check, so a large body is refused from its
 * declared length, and a body without one (chunked) is read only up to the
 * limit.
 */
export const readBounded = async (
  request: Request,
  limit: number,
): Promise<string | null> => {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
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

  const raw = await readBounded(request, MAX_ORDER_BYTES);
  if (raw === null) return status(413);
  if (!(await verifyShopifyHmac(env.SHOPIFY_WEBHOOK_SECRET, raw, signature)))
    return status(401);

  let order: WebhookOrder;
  try {
    order = JSON.parse(raw) as WebhookOrder;
  } catch {
    return status(400);
  }

  const event = orderCompletedEvent(order, env.POSTHOG_KEY ?? "");
  // No analytics id on the cart (no consent): nothing to send, ever.
  if (!event) return status(200);
  // Consented, but no key to send with: ask Shopify to retry once it's set.
  if (!env.POSTHOG_KEY) return status(503);

  // Stored and timed, not sent yet. If storing fails, Shopify retries.
  try {
    await env.ORDER_BACKUP.get(env.ORDER_BACKUP.idFromName(String(order.id))).schedule(
      event,
    );
    return status(200);
  } catch {
    return status(503);
  }
};
