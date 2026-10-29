import { CART_ATTRIBUTES, POSTHOG_HOST, PRODUCT_EVENTS } from "./product-analytics";

/**
 * A purchase, sent to PostHog from Shopify's order webhook (SHO-88).
 *
 * The checkout pixel (pixel/posthog.js) already sends `order_completed` when
 * the shopper's browser finishes checkout. It misses an order when the pixel
 * doesn't run: analytics declined again in checkout, a blocker, a closed tab.
 * The webhook fills that gap from the server.
 *
 * Both send the **same event id** for an order (`orderEventUuid`), so PostHog
 * keeps one event however many times it's reported: pixel and webhook,
 * Shopify's webhook retries, or a replay. PostHog merges events with the same
 * uuid, distinct id, event and day.
 *
 * Consent: only orders whose cart carries `_posthog_id` are sent. Web and the
 * app add it only for shoppers who allowed analytics; theme carts never have
 * it (the pixel, under Shopify's consent, covers them).
 */

/** FNV-1a over a string, 64-bit, from a given offset basis. */
const fnv64 = (text: string, basis: bigint): bigint => {
  let hash = basis;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
};

/**
 * The event id for an order's `order_completed`: a UUID derived from the
 * order id alone, so every sender agrees on it. Version nibble 8 (custom,
 * RFC 9562) and the RFC variant. pixel/posthog.js repeats this exactly;
 * pixel.test.ts checks they agree.
 */
export const orderEventUuid = (orderId: string): string => {
  const key = `order_completed:${orderId}`;
  const hex =
    fnv64(key, 0xcbf29ce484222325n).toString(16).padStart(16, "0") +
    fnv64(key, 0x84222325cbf29ce4n).toString(16).padStart(16, "0");
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** The parts of Shopify's order webhook payload (REST Order) used here. */
export interface WebhookOrder {
  readonly id: number | string;
  readonly created_at: string;
  readonly currency: string;
  readonly total_price: string;
  readonly note_attributes?:
    readonly { readonly name: string; readonly value: string }[] | null;
  readonly line_items?: readonly { readonly quantity: number }[] | null;
}

export interface CapturedOrderEvent {
  readonly api_key: string;
  readonly event: string;
  readonly uuid: string;
  readonly distinct_id: string;
  readonly timestamp: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/**
 * The PostHog event for an order, or null when it mustn't be sent (no
 * analytics id on the cart, so no consent to send it).
 *
 * The same properties as the pixel's, except `has_subscription`: the webhook
 * payload doesn't say which lines are on a selling plan, so it's left out
 * rather than guessed.
 */
export const orderCompletedEvent = (
  order: WebhookOrder,
  apiKey: string,
): CapturedOrderEvent | null => {
  const attribute = (name: string) =>
    order.note_attributes?.find((entry) => entry.name === name)?.value || null;
  const distinctId = attribute(CART_ATTRIBUTES.distinctId);
  if (!distinctId) return null;
  const surface = attribute(CART_ATTRIBUTES.surface);
  const orderId = String(order.id);
  return {
    api_key: apiKey,
    event: PRODUCT_EVENTS.orderCompleted,
    uuid: orderEventUuid(orderId),
    distinct_id: distinctId,
    timestamp: new Date(order.created_at).toISOString(),
    properties: {
      order_id: orderId,
      item_count: (order.line_items ?? []).reduce((sum, line) => sum + line.quantity, 0),
      order_value: Number(order.total_price),
      currency: order.currency,
      surface: surface === "web" || surface === "app" ? surface : "theme",
      $lib: "formulate-webhook",
    },
  };
};

export const POSTHOG_CAPTURE_URL = `${POSTHOG_HOST}/i/v0/e/`;
