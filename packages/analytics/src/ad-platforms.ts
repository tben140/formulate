import type { AdEvent, AdEventName } from "./ad-events";

/**
 * The same three storefront events as ad-events.ts, translated for TikTok,
 * Pinterest, Snapchat, Reddit and Microsoft Advertising.
 *
 * Each platform names the events differently, and two have no "begin
 * checkout" at all. A translator returns null for an event its platform
 * doesn't have, and the caller sends nothing. Pinterest's `checkout` and
 * Reddit's `Purchase` mean a completed order, which Shopify's channel apps
 * report from checkout. Sending them on the way into checkout would count
 * every abandoned basket as a sale.
 *
 * Every browser call carries the event's id where the platform supports
 * deduplication, and the server builders send the same id.
 */

const quantity = (event: AdEvent) =>
  event.items.reduce((sum, item) => sum + item.quantity, 0);

// --- TikTok ------------------------------------------------------------------

const TIKTOK: Record<AdEventName, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
};

const tiktokProperties = (event: AdEvent) => ({
  currency: event.currency,
  value: event.value,
  content_type: event.name === "view_item" ? "product_group" : "product",
  contents: event.items.map((item) => ({
    content_id: item.id,
    content_name: item.name,
    price: item.price,
    quantity: item.quantity,
  })),
});

/** `ttq.track(name, properties, { event_id })`. */
export const toTikTokPixel = (event: AdEvent) =>
  [TIKTOK[event.name], tiktokProperties(event), { event_id: event.eventId }] as const;

// --- Pinterest ---------------------------------------------------------------

const PINTEREST_TAG: Partial<Record<AdEventName, string>> = {
  view_item: "pagevisit",
  add_to_cart: "addtocart",
};
const PINTEREST_API: Partial<Record<AdEventName, string>> = {
  view_item: "page_visit",
  add_to_cart: "add_to_cart",
};

/** `pintrk("track", name, data)`, or null for begin_checkout (see above). */
export const toPinterestTag = (event: AdEvent) => {
  const name = PINTEREST_TAG[event.name];
  if (!name) return null;
  return [
    "track",
    name,
    {
      event_id: event.eventId,
      currency: event.currency,
      value: event.value,
      order_quantity: quantity(event),
      line_items: event.items.map((item) => ({
        product_id: item.id,
        product_name: item.name,
        product_price: item.price,
        product_quantity: item.quantity,
      })),
    },
  ] as const;
};

// --- Snapchat ----------------------------------------------------------------

const SNAP: Record<AdEventName, string> = {
  view_item: "VIEW_CONTENT",
  add_to_cart: "ADD_CART",
  begin_checkout: "START_CHECKOUT",
};

/** `snaptr("track", name, data)`; `client_dedup_id` pairs it with the server copy. */
export const toSnapPixel = (event: AdEvent) =>
  [
    "track",
    SNAP[event.name],
    {
      currency: event.currency,
      price: event.value,
      item_ids: event.items.map((item) => item.id),
      number_items: quantity(event),
      client_dedup_id: event.eventId,
    },
  ] as const;

// --- Reddit ------------------------------------------------------------------

const REDDIT: Partial<Record<AdEventName, string>> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
};

/** `rdt("track", name, data)`, or null for begin_checkout (see above). */
export const toRedditPixel = (event: AdEvent) => {
  const name = REDDIT[event.name];
  if (!name) return null;
  return [
    "track",
    name,
    {
      currency: event.currency,
      value: event.value,
      itemCount: quantity(event),
      products: event.items.map((item) => ({ id: item.id, name: item.name })),
      conversionId: event.eventId,
    },
  ] as const;
};

// --- Microsoft Advertising (UET) --------------------------------------------

const UET_PAGE_TYPE: Record<AdEventName, string> = {
  view_item: "product",
  add_to_cart: "cart",
  begin_checkout: "cart",
};

/**
 * `uetq.push("event", name, data)`. UET takes GA4's event names, plus its own
 * `ecomm_*` fields for remarketing.
 */
export const toUet = (event: AdEvent) =>
  [
    "event",
    event.name,
    {
      currency: event.currency,
      revenue_value: event.value,
      ecomm_prodid: event.items.map((item) => item.id),
      ecomm_pagetype: UET_PAGE_TYPE[event.name],
      ecomm_totalvalue: event.value,
      items: event.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        price: item.price,
      })),
    },
  ] as const;

// --- Server-side --------------------------------------------------------------

/** What the server knows about the request an event arrived on. */
export interface ServerContext {
  /** Unix seconds. */
  readonly eventTime: number;
  readonly sourceUrl: string;
  readonly userAgent: string;
  readonly ipAddress?: string;
  /** Platform cookies, read from the request: `_ttp`, `_epik`, `_scid`. */
  readonly cookies: {
    readonly ttp?: string;
    readonly epik?: string;
    readonly scid?: string;
  };
}

/** One event for TikTok's Events API (web). Same name and `event_id` as the Pixel. */
export const toTikTokServerEvent = (event: AdEvent, context: ServerContext) => ({
  event: TIKTOK[event.name],
  event_time: context.eventTime,
  event_id: event.eventId,
  user: {
    user_agent: context.userAgent,
    ...(context.ipAddress ? { ip: context.ipAddress } : {}),
    ...(context.cookies.ttp ? { ttp: context.cookies.ttp } : {}),
  },
  page: { url: context.sourceUrl },
  properties: tiktokProperties(event),
});

/**
 * One event for Pinterest's Conversions API, or null where the tag sends
 * nothing. Pinterest takes `value` and `item_price` as strings.
 */
export const toPinterestServerEvent = (event: AdEvent, context: ServerContext) => {
  const name = PINTEREST_API[event.name];
  if (!name) return null;
  return {
    event_name: name,
    action_source: "web",
    event_time: context.eventTime,
    event_id: event.eventId,
    event_source_url: context.sourceUrl,
    user_data: {
      client_user_agent: context.userAgent,
      ...(context.ipAddress ? { client_ip_address: context.ipAddress } : {}),
      ...(context.cookies.epik ? { click_id: context.cookies.epik } : {}),
    },
    custom_data: {
      currency: event.currency,
      value: event.value.toFixed(2),
      content_ids: event.items.map((item) => item.id),
      contents: event.items.map((item) => ({
        item_price: item.price.toFixed(2),
        quantity: item.quantity,
      })),
      num_items: quantity(event),
    },
  };
};

/**
 * One event for Snapchat's Conversions API (v3). `event_id` matches the
 * Pixel's `client_dedup_id`. `sc_cookie1` is the `_scid` cookie, as Snap's
 * docs ask.
 */
export const toSnapServerEvent = (event: AdEvent, context: ServerContext) => ({
  event_name: SNAP[event.name],
  action_source: "WEB",
  event_time: context.eventTime,
  event_id: event.eventId,
  event_source_url: context.sourceUrl,
  user_data: {
    client_user_agent: context.userAgent,
    ...(context.ipAddress ? { client_ip_address: context.ipAddress } : {}),
    ...(context.cookies.scid ? { sc_cookie1: context.cookies.scid } : {}),
  },
  custom_data: {
    currency: event.currency,
    value: event.value,
    content_ids: event.items.map((item) => item.id),
    contents: event.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      item_price: item.price,
    })),
    num_items: quantity(event),
  },
});
