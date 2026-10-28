/*
 * PostHog custom pixel: the theme's product analytics, and every surface's
 * completed orders.
 *
 * Install: Shopify admin → Settings → Customer events → Add custom pixel.
 * Paste this whole file, replace __POSTHOG_KEY__ with the project's public key
 * (the same value as NEXT_PUBLIC_POSTHOG_KEY), set Permission to "Required"
 * with Analytics ticked, set Data sale to "Data collected does not qualify as
 * data sale", then Save and Connect. See docs/integration-posthog.md.
 *
 * ⚠️ Self-contained on purpose: Shopify runs pasted code as it is, with no
 * imports. So it repeats a little of packages/analytics (the event names, the
 * cart attribute keys, the session id). src/pixel.test.ts runs this file and
 * fails if any of that drifts from the shared module.
 *
 * Where it runs, and what it sends:
 * - The Liquid theme's pages: page views, product views, adds to cart, cart
 *   views and checkout starts, as surface "theme". Web and the app send their
 *   own; Shopify doesn't run pixels on a headless storefront's pages.
 * - Every checkout, whichever surface built the cart: order_completed. Web and
 *   the app tag the carts they create (`_posthog_id`, `_surface`), so the
 *   order is credited to the same PostHog person as the visit before it.
 *   Their carts' checkout_started is skipped here, because they send it
 *   themselves.
 *
 * Consent is Shopify's: with Analytics required, Shopify only runs this for
 * visitors who allowed analytics, on the theme and in checkout.
 */

/* global analytics, browser, fetch -- provided by Shopify's custom pixel sandbox */

const POSTHOG_KEY = "__POSTHOG_KEY__";
const POSTHOG_HOST = "https://eu.i.posthog.com";

/** Must match PRODUCT_EVENTS in packages/analytics. */
const EVENTS = {
  productViewed: "product_viewed",
  addedToCart: "product_added_to_cart",
  cartViewed: "cart_viewed",
  checkoutStarted: "checkout_started",
  orderCompleted: "order_completed",
};

/** Must match CART_ATTRIBUTES in packages/analytics. */
const ATTRIBUTES = { distinctId: "_posthog_id", surface: "_surface" };

const SESSION_KEY = "formulate_ph_session";
const SESSION_IDLE_MS = 30 * 60 * 1000;

const numericId = (gid) => (gid ? String(gid).split("/").pop() : "");

/** "/products/magnesium-glycinate?variant=1" → "magnesium-glycinate". */
const handleFromUrl = (url) => /\/products\/([^/?#]+)/.exec(url || "")?.[1] ?? "";

const amount = (money) => Number(money?.amount ?? 0);

const randomHex = (length) => {
  let out = "";
  for (let i = 0; i < length; i++) out += ((Math.random() * 16) | 0).toString(16);
  return out;
};

/** A time-ordered v7 UUID, the `$session_id` format PostHog's sessions use. */
const sessionUuid = (now) => {
  const hex = now.toString(16).padStart(12, "0");
  const random = randomHex(20);
  const variant = ((parseInt(random[3], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${random.slice(0, 3)}-${variant}${random.slice(4, 7)}-${random.slice(8, 20)}`;
};

/** This tab's session, ended by 30 idle minutes, as in packages/analytics. */
const session = async () => {
  const now = Date.now();
  let stored = null;
  try {
    stored = JSON.parse((await browser.sessionStorage.getItem(SESSION_KEY)) || "null");
  } catch {
    // Unreadable or blocked: start a new session.
  }
  const id =
    stored && now - stored.lastActive < SESSION_IDLE_MS ? stored.id : sessionUuid(now);
  try {
    await browser.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ id, lastActive: now }),
    );
  } catch {
    // Storage blocked: this event still goes, with a session that won't last.
  }
  return id;
};

const attribute = (checkout, key) =>
  (checkout?.attributes ?? []).find((entry) => entry.key === key)?.value || null;

/** Web or app, from the cart's attribute; anything else is the theme's. */
const surfaceOf = (checkout) => {
  const surface = attribute(checkout, ATTRIBUTES.surface);
  return surface === "web" || surface === "app" ? surface : "theme";
};

const productRef = (product, url) => ({
  product_id: numericId(product?.id),
  product_handle: handleFromUrl(url ?? product?.url),
  product_title: product?.title ?? "",
});

/**
 * An order's event id, the same one the server sends from Shopify's order
 * webhook, so PostHog keeps one order_completed per order. Must match
 * orderEventUuid in packages/analytics (pixel.test.ts checks).
 */
const fnv64 = (text, basis) => {
  let hash = basis;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash;
};
const orderEventUuid = (orderId) => {
  const key = `order_completed:${orderId}`;
  const hex =
    fnv64(key, 0xcbf29ce484222325n).toString(16).padStart(16, "0") +
    fnv64(key, 0x84222325cbf29ce4n).toString(16).padStart(16, "0");
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const send = async (
  event,
  name,
  properties,
  distinctId,
  surface = "theme",
  uuid = undefined,
) => {
  if (!POSTHOG_KEY || POSTHOG_KEY.startsWith("__")) return;
  const body = {
    api_key: POSTHOG_KEY,
    ...(uuid ? { uuid } : {}),
    event: name,
    // Shopify's own id for this browser: the same on the theme and its checkout.
    distinct_id: distinctId || event.clientId,
    timestamp: event.timestamp,
    properties: {
      ...properties,
      surface,
      $session_id: await session(),
      $lib: "formulate-pixel",
      $current_url: event.context?.document?.location?.href ?? null,
    },
  };
  try {
    await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // Analytics never gets in the way of a purchase.
  }
};

/*
 * Checkout's own page views are skipped: for a web or app cart they'd count
 * against Shopify's browser id, not the shopper's, and the order event already
 * says the checkout happened.
 */
analytics.subscribe("page_viewed", (event) => {
  const path = event.context?.document?.location?.pathname ?? "";
  if (path.startsWith("/checkouts")) return;
  void send(event, "$pageview", {});
});

analytics.subscribe("product_viewed", (event) => {
  const variant = event.data?.productVariant;
  if (!variant) return;
  void send(event, EVENTS.productViewed, {
    ...productRef(variant.product),
    price: amount(variant.price),
    currency: variant.price?.currencyCode ?? "",
  });
});

/*
 * Shopify's cart line here is what this add added. It carries no selling plan,
 * so a theme add can't say whether it was a subscription: `selling_plan` is
 * null, and checkout_started's `has_subscription` is the reliable signal.
 */
analytics.subscribe("product_added_to_cart", (event) => {
  const line = event.data?.cartLine;
  if (!line?.merchandise) return;
  const quantity = line.quantity || 1;
  void send(event, EVENTS.addedToCart, {
    ...productRef(line.merchandise.product),
    variant_id: numericId(line.merchandise.id),
    quantity,
    price: Math.round((amount(line.cost?.totalAmount) / quantity) * 100) / 100,
    currency:
      line.cost?.totalAmount?.currencyCode ?? line.merchandise.price?.currencyCode ?? "",
    selling_plan: null,
  });
});

analytics.subscribe("cart_viewed", (event) => {
  const cart = event.data?.cart;
  if (!cart) return;
  void send(event, EVENTS.cartViewed, {
    item_count: cart.totalQuantity ?? 0,
    cart_value: amount(cart.cost?.totalAmount),
    currency: cart.cost?.totalAmount?.currencyCode ?? "",
  });
});

const lineCount = (checkout) =>
  (checkout.lineItems ?? []).reduce((sum, line) => sum + (line.quantity ?? 0), 0);

const hasSubscription = (checkout) =>
  (checkout.lineItems ?? []).some((line) => Boolean(line.sellingPlanAllocation));

analytics.subscribe("checkout_started", (event) => {
  const checkout = event.data?.checkout;
  if (!checkout || surfaceOf(checkout) !== "theme") return;
  void send(event, EVENTS.checkoutStarted, {
    item_count: lineCount(checkout),
    cart_value: amount(checkout.subtotalPrice),
    currency: checkout.currencyCode ?? checkout.subtotalPrice?.currencyCode ?? "",
    has_subscription: hasSubscription(checkout),
  });
});

analytics.subscribe("checkout_completed", (event) => {
  const checkout = event.data?.checkout;
  if (!checkout) return;
  void send(
    event,
    EVENTS.orderCompleted,
    {
      order_id: numericId(checkout.order?.id),
      item_count: lineCount(checkout),
      order_value: amount(checkout.totalPrice),
      currency: checkout.currencyCode ?? checkout.totalPrice?.currencyCode ?? "",
      has_subscription: hasSubscription(checkout),
    },
    attribute(checkout, ATTRIBUTES.distinctId),
    surfaceOf(checkout),
    checkout.order?.id ? orderEventUuid(numericId(checkout.order.id)) : undefined,
  );
});
