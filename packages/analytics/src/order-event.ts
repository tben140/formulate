import { CART_ATTRIBUTES, POSTHOG_HOST, PRODUCT_EVENTS } from "./product-analytics";

/**
 * A purchase, sent to PostHog from Shopify's order webhook (SHO-88).
 *
 * The checkout pixel (pixel/posthog.js) already sends `order_completed` when
 * the shopper's browser finishes checkout, credited to their visit. It misses
 * an order when the pixel doesn't run: analytics declined in checkout, a
 * blocker, a closed tab. The webhook counts those from the server.
 *
 * **Anonymous, always** (ADR 0012). The webhook can't tell a shopper who
 * declined analytics in checkout from one whose tab closed: Shopify's order
 * payload doesn't carry the checkout's consent choice. So its event is never
 * linked to a person. No visitor id, no order id, no person profile: an id
 * of its own (see `anonymousOrderEventId` in apps/api), the order's value,
 * item count, currency, surface and time. Revenue and order counts stay
 * complete; who bought stays with the pixel, under the shopper's consent.
 *
 * The pixel's and the webhook's events can't merge in PostHog (different ids,
 * and the pixel can't know the order's `created_at`), so the webhook's is a
 * backup, held and sent only if the pixel doesn't report the order
 * (apps/api/src/order-backup.ts).
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
 * The pixel's event id for an order's `order_completed`: a UUID derived from
 * the order id, so a retried pixel send is merged by PostHog. Version nibble 8
 * (custom, RFC 9562) and the RFC variant. pixel/posthog.js repeats this
 * exactly; pixel.test.ts checks they agree. The webhook's anonymous event
 * doesn't use it: anyone could recompute it from an order id.
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
  /** The pixel's `checkout.token` for the same checkout; null for admin orders. */
  readonly checkout_token?: string | null;
  readonly note_attributes?:
    readonly { readonly name: string; readonly value: string }[] | null;
  readonly line_items?: readonly { readonly quantity: number }[] | null;
  /** Where the order came from: "web" (checkout), "shopify_draft_order", a channel id. */
  readonly source_name?: string | null;
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
 * The anonymous PostHog event for an order. `eventId` must be stable for the
 * order, so Shopify's retries and our own resends merge in PostHog, and must
 * not be derivable from the order id; it's both the event's id and its
 * `distinct_id`, with person processing off, so no person is created.
 *
 * The same figures as the pixel's, except `has_subscription` (the payload
 * doesn't say which lines are on a selling plan) and `order_id` (it would
 * link the event to a customer in the admin).
 */
export const orderCompletedEvent = (
  order: WebhookOrder,
  apiKey: string,
  eventId: string,
): CapturedOrderEvent => {
  const surface = order.note_attributes?.find(
    (entry) => entry.name === CART_ATTRIBUTES.surface,
  )?.value;
  return {
    api_key: apiKey,
    event: PRODUCT_EVENTS.orderCompleted,
    uuid: eventId,
    distinct_id: eventId,
    timestamp: new Date(order.created_at).toISOString(),
    properties: {
      item_count: (order.line_items ?? []).reduce((sum, line) => sum + line.quantity, 0),
      order_value: Number(order.total_price),
      currency: order.currency,
      surface: surface === "web" || surface === "app" ? surface : "theme",
      source_name: order.source_name ?? null,
      $process_person_profile: false,
      $geoip_disable: true,
      $lib: "formulate-webhook",
    },
  };
};

export const POSTHOG_CAPTURE_URL = `${POSTHOG_HOST}/i/v0/e/`;
