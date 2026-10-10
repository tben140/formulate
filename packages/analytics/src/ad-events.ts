import { legacyIdFromGid } from "./events";

/**
 * Google and Meta ad-platform events, built once from the storefront's own
 * data and translated per platform.
 *
 * Three events, the ones the storefront itself sees. Purchase isn't here:
 * every surface checks out on Shopify, where the Google & YouTube and
 * Facebook & Instagram apps report it from checkout. See docs/integration-ad-pixels.md.
 *
 * Every event carries an `eventId`. The browser tag and the server-side copy
 * (Meta's Conversions API) send the same id, which is how Meta counts the
 * pair as one event rather than two.
 */

interface MoneyLike {
  readonly amount: string;
  readonly currencyCode: string;
}

export type AdEventName = "view_item" | "add_to_cart" | "begin_checkout";

export interface AdItem {
  /** Shopify's catalogue id, `shopify_GB_<product>_<variant>`. See `catalogueId`. */
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly quantity: number;
}

export interface AdEvent {
  readonly name: AdEventName;
  readonly eventId: string;
  readonly currency: string;
  readonly value: number;
  readonly items: readonly AdItem[];
}

/**
 * The id Shopify's own Google and Meta channel apps give a product in the
 * catalogues they sync: `shopify_<country>_<productId>_<variantId>`, or
 * without the variant for the product as a whole.
 *
 * Using the same ids means a browser AddToCart and the apps' checkout
 * Purchase refer to the same catalogue items, which is what dynamic ads and
 * product-level reporting join on.
 */
export const catalogueId = (
  productGid: string,
  variantGid?: string,
  country = "GB",
): string =>
  variantGid
    ? `shopify_${country}_${legacyIdFromGid(productGid)}_${legacyIdFromGid(variantGid)}`
    : `shopify_${country}_${legacyIdFromGid(productGid)}`;

const toNumber = (money: MoneyLike): number => {
  const value = Number(money.amount);
  return Number.isFinite(value) ? value : 0;
};

/** Two decimal places: platforms reject or misread float noise like 35.900000000000006. */
const round = (value: number): number => Math.round(value * 100) / 100;

interface ProductLike {
  readonly id: string;
  readonly title: string;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
}

interface CartLineLike {
  readonly quantity: number;
  readonly merchandise: {
    readonly id: string;
    readonly price: MoneyLike;
    readonly product: { readonly id: string; readonly title: string };
  };
}

interface CartLike {
  readonly cost: { readonly subtotalAmount: MoneyLike };
  readonly lines: { readonly nodes: readonly CartLineLike[] };
}

const lineItem = (line: CartLineLike): AdItem => ({
  id: catalogueId(line.merchandise.product.id, line.merchandise.id),
  name: line.merchandise.product.title,
  price: round(toNumber(line.merchandise.price)),
  quantity: line.quantity,
});

export const viewItem = (product: ProductLike, eventId: string): AdEvent => {
  const price = round(toNumber(product.priceRange.minVariantPrice));
  return {
    name: "view_item",
    eventId,
    currency: product.priceRange.minVariantPrice.currencyCode,
    value: price,
    items: [{ id: catalogueId(product.id), name: product.title, price, quantity: 1 }],
  };
};

/** The value is what was added, not the cart's new total. */
export const addToCart = (line: CartLineLike, eventId: string): AdEvent => {
  const item = lineItem(line);
  return {
    name: "add_to_cart",
    eventId,
    currency: line.merchandise.price.currencyCode,
    value: round(item.price * item.quantity),
    items: [item],
  };
};

export const beginCheckout = (cart: CartLike, eventId: string): AdEvent => ({
  name: "begin_checkout",
  eventId,
  currency: cart.cost.subtotalAmount.currencyCode,
  value: round(toNumber(cart.cost.subtotalAmount)),
  items: cart.lines.nodes.map(lineItem),
});

/** GA4's recommended ecommerce events take our names and these parameters as-is. */
export const toGa4 = (event: AdEvent) =>
  [
    "event",
    event.name,
    {
      currency: event.currency,
      value: event.value,
      items: event.items.map((item) => ({
        item_id: item.id,
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    },
  ] as const;

const META_NAMES: Record<AdEventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
};

/** Meta's standard-event parameters, shared by the Pixel and the Conversions API. */
export const metaCustomData = (event: AdEvent) => ({
  currency: event.currency,
  value: event.value,
  // A product page is about the product as a whole: Meta's "product_group",
  // which the Facebook channel app sets to the product-level id.
  content_type: event.name === "view_item" ? "product_group" : "product",
  content_ids: event.items.map((item) => item.id),
  contents: event.items.map((item) => ({
    id: item.id,
    quantity: item.quantity,
    item_price: item.price,
  })),
  num_items: event.items.reduce((sum, item) => sum + item.quantity, 0),
});

/** Arguments for `fbq("track", …)`: the event, its data, and the deduplication id. */
export const toMetaPixel = (event: AdEvent) =>
  [
    "track",
    META_NAMES[event.name],
    metaCustomData(event),
    { eventID: event.eventId },
  ] as const;

export interface MetaServerContext {
  /** Unix seconds. */
  readonly eventTime: number;
  readonly sourceUrl: string;
  readonly userAgent: string;
  readonly ipAddress?: string;
  /** The `_fbp` cookie: Meta's browser id, set by the Pixel. */
  readonly fbp?: string;
  /** The `_fbc` cookie: the ad click id, when the visit came from an ad. */
  readonly fbc?: string;
}

/**
 * One event for Meta's Conversions API. Same name, data and `event_id` as the
 * Pixel's copy, so Meta keeps one of the two.
 *
 * `user_data` holds only what the browser already gave Meta: the user agent,
 * the IP the request came from, and Meta's own two cookies. No email or phone,
 * hashed or not. Shoppers are anonymous here.
 */
export const toMetaServerEvent = (event: AdEvent, context: MetaServerContext) => ({
  event_name: META_NAMES[event.name],
  event_time: context.eventTime,
  event_id: event.eventId,
  action_source: "website" as const,
  event_source_url: context.sourceUrl,
  user_data: {
    client_user_agent: context.userAgent,
    ...(context.ipAddress ? { client_ip_address: context.ipAddress } : {}),
    ...(context.fbp ? { fbp: context.fbp } : {}),
    ...(context.fbc ? { fbc: context.fbc } : {}),
  },
  custom_data: metaCustomData(event),
});

const NAMES = new Set<AdEventName>(["view_item", "add_to_cart", "begin_checkout"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isShortString = (value: unknown, max = 200): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 100_000;

/**
 * Validates an event that arrived from a browser, for the server to forward.
 *
 * The endpoint that receives these is public, like every pixel endpoint, so
 * anything can be posted to it. This keeps what reaches Meta to the shape the
 * storefront sends: a known event name, bounded numbers, at most 100 items,
 * and nothing else. It returns a fresh object built from checked fields, so
 * extra fields never pass through.
 */
export const parseAdEvent = (input: unknown): AdEvent | null => {
  if (!isRecord(input)) return null;
  const { name, eventId, currency, value, items } = input;
  if (typeof name !== "string" || !NAMES.has(name as AdEventName)) return null;
  if (!isShortString(eventId, 64) || !/^[A-Za-z0-9-]+$/.test(eventId)) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (!isAmount(value)) return null;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return null;

  const parsed: AdItem[] = [];
  for (const item of items) {
    if (!isRecord(item)) return null;
    const { id, name: itemName, price, quantity } = item;
    if (!isShortString(id, 100) || !/^shopify_[A-Z]{2}_\d+(_\d+)?$/.test(id)) return null;
    if (!isShortString(itemName)) return null;
    if (!isAmount(price)) return null;
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 999
    ) {
      return null;
    }
    parsed.push({ id, name: itemName, price, quantity });
  }

  return { name: name as AdEventName, eventId, currency, value, items: parsed };
};
