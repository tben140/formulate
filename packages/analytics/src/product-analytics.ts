/**
 * Product analytics into PostHog (SHO-87): one event vocabulary for web and
 * the app, so a funnel built in PostHog counts both surfaces the same way.
 *
 * ⚠️ Every event name and property shape lives here. A string literal event
 * name in an app is a bug, the same rule as design tokens: two surfaces
 * spelling "add to cart" differently would split one funnel into two.
 *
 * No PostHog SDK, deliberately. Events go to PostHog's HTTP capture API with
 * bare `fetch`, like packages/shopify, so the same code runs in browsers and
 * in React Native:
 * - nothing loads before consent (each app's gate is simply whether it
 *   creates a client at all), which is how web already gates Klaviyo;
 * - web keeps its JavaScript budget (SHO-148); the SDK is tens of kB;
 * - the project has autocapture, replay and heatmaps off, so the SDK's main
 *   extras would go unused. Feature flags (SHO-89) can use the flags API
 *   directly when needed.
 *
 * Not to be confused with ./events.ts: that is Klaviyo's Shopify event shape,
 * which isn't ours to design. This one is.
 */

/** EU Cloud: the project lives in the EU (2026-10-09). */
export const POSTHOG_HOST = "https://eu.i.posthog.com";

/** PostHog's own name for a web page view and an app screen view. */
export const PAGEVIEW = "$pageview";
export const SCREEN = "$screen";

export const PRODUCT_EVENTS = {
  productViewed: "product_viewed",
  variantSelected: "variant_selected",
  sellingPlanSelected: "selling_plan_selected",
  addedToCart: "product_added_to_cart",
  cartViewed: "cart_viewed",
  checkoutStarted: "checkout_started",
} as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[keyof typeof PRODUCT_EVENTS];

export type Surface = "web" | "app";

/** The product a product-level event is about. */
export interface ProductRef {
  /** Numeric Shopify id, as a string: PostHog filters work on either. */
  readonly product_id: string;
  readonly product_handle: string;
  readonly product_title: string;
}

export interface ProductEventProperties {
  readonly product_viewed: ProductRef & {
    readonly price: number;
    readonly currency: string;
  };
  readonly variant_selected: ProductRef & {
    readonly variant_id: string;
    readonly variant_title: string;
  };
  readonly selling_plan_selected: ProductRef & {
    /** The plan's name ("30 day subscription…"), or null for one-time purchase. */
    readonly selling_plan: string | null;
  };
  readonly product_added_to_cart: ProductRef & {
    readonly variant_id: string;
    readonly quantity: number;
    readonly price: number;
    readonly currency: string;
    readonly selling_plan: string | null;
  };
  readonly cart_viewed: {
    readonly item_count: number;
    readonly cart_value: number;
    readonly currency: string;
  };
  readonly checkout_started: {
    readonly item_count: number;
    readonly cart_value: number;
    readonly currency: string;
    /** Whether any line is a subscription: the Recharge half of the funnel. */
    readonly has_subscription: boolean;
  };
}

/** "gid://shopify/Product/123" → "123"; anything else unchanged. */
export const numericId = (gid: string): string => gid.split("/").pop() ?? gid;

/** A random v4 UUID for an anonymous visitor. Not security: just unique enough. */
export const anonymousId = (): string => {
  // Typed here, not from lib.dom: this package also compiles under the
  // Worker's and React Native's type sets, which describe crypto differently.
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  // Hermes may lack crypto; an analytics id doesn't need it.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

/**
 * A v7 UUID (time-ordered), the format PostHog's own SDKs use for
 * `$session_id`; Web Analytics derives sessions and their start times from it.
 */
export const sessionUuid = (now: number = Date.now()): string => {
  const hex = now.toString(16).padStart(12, "0");
  const random = anonymousId().replace(/-/g, "").slice(12);
  const variant = ((parseInt(random.slice(4, 5), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${random.slice(0, 3)}-${variant}${random.slice(5, 8)}-${random.slice(8, 20)}`;
};

/** A session ends after 30 minutes without an event, as in PostHog's SDKs. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/**
 * The slice of `fetch` this module uses. Its own type rather than `typeof
 * fetch`, whose RequestInit differs between the browser, React Native and
 * Cloudflare Workers type sets (the Worker imports this package too).
 */
export type FetchLike = (
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly keepalive: boolean;
  },
) => Promise<unknown>;

export interface AnalyticsIdentity {
  /** The anonymous id, kept for as long as consent lasts. */
  readonly distinctId: string;
  readonly sessionId: string;
}

export interface ProductAnalyticsConfig {
  readonly apiKey: string;
  readonly surface: Surface;
  /** Current ids; the app owns where they're kept. Called once per event. */
  readonly identity: () => AnalyticsIdentity;
  /** Extra properties on every event: `$current_url` on web, app version, … */
  readonly context?: () => Readonly<Record<string, string | number | boolean | null>>;
  /** Defaults to global fetch; `keepalive` lets web events survive navigation. */
  readonly fetch?: FetchLike;
  readonly host?: string;
}

export interface CapturedEvent {
  readonly api_key: string;
  readonly event: string;
  readonly distinct_id: string;
  readonly timestamp: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** The request body for one event. Exported for tests. */
export const captureBody = (
  config: ProductAnalyticsConfig,
  event: string,
  properties: object,
  now: Date = new Date(),
): CapturedEvent => {
  const { distinctId, sessionId } = config.identity();
  return {
    api_key: config.apiKey,
    event,
    distinct_id: distinctId,
    timestamp: now.toISOString(),
    properties: {
      ...config.context?.(),
      ...properties,
      surface: config.surface,
      $session_id: sessionId,
      $lib: `formulate-${config.surface}`,
    },
  };
};

export interface ProductAnalytics {
  readonly capture: <E extends ProductEventName>(
    event: E,
    properties: ProductEventProperties[E],
  ) => void;
  /** Web: a page view. `$current_url` comes from `context`. */
  readonly pageview: () => void;
  /** App: a screen view. */
  readonly screen: (name: string) => void;
  /**
   * Links the anonymous visitor to a signed-in customer (the Shopify customer
   * id), so the funnel before sign-in joins what happens after.
   */
  readonly identify: (customerId: string) => void;
}

/**
 * A client. Each app creates one only once tracking is allowed: consent on
 * web, the in-app choice in the app. No client, no requests.
 *
 * Failures are swallowed: analytics must never break a page or a purchase.
 */
export const createProductAnalytics = (
  config: ProductAnalyticsConfig,
): ProductAnalytics => {
  const send = (event: string, properties: object) => {
    const body = captureBody(config, event, properties);
    const post = config.fetch ?? (globalThis.fetch as unknown as FetchLike);
    void post(`${config.host ?? POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  };

  return {
    capture: (event, properties) => send(event, properties),
    pageview: () => send(PAGEVIEW, {}),
    screen: (name) => send(SCREEN, { $screen_name: name }),
    identify: (customerId) => {
      const { distinctId } = config.identity();
      if (!customerId || customerId === distinctId) return;
      // PostHog's capture-API identify: the event comes from the known id and
      // names the anonymous one, which merges the two into one person.
      const body = captureBody(config, "$identify", { $anon_distinct_id: distinctId });
      const post = config.fetch ?? (globalThis.fetch as unknown as FetchLike);
      void post(`${config.host ?? POSTHOG_HOST}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, distinct_id: customerId }),
        keepalive: true,
      }).catch(() => undefined);
    },
  };
};

/*
 * Payload builders, shared so both apps derive the same numbers from the same
 * Storefront data. Structural types: they take what the queries return
 * without depending on generated types.
 */

interface MoneyLike {
  readonly amount: string;
  readonly currencyCode: string;
}

interface ProductLike {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
}

interface CartLineLike {
  readonly quantity: number;
  /** What the line actually costs, after any subscription discount. */
  readonly cost?: { readonly totalAmount: MoneyLike };
  readonly merchandise: {
    readonly id?: string;
    readonly price?: MoneyLike;
    readonly product?: ProductLike;
  };
  readonly sellingPlanAllocation?: {
    readonly sellingPlan: { readonly name: string };
  } | null;
}

interface CartLike {
  readonly totalQuantity: number;
  readonly cost: { readonly subtotalAmount: MoneyLike };
  readonly lines: { readonly nodes: readonly CartLineLike[] };
}

export const productRef = (product: ProductLike): ProductRef => ({
  product_id: numericId(product.id),
  product_handle: product.handle,
  product_title: product.title,
});

export const productViewedProperties = (
  product: ProductLike & { readonly priceRange: { readonly minVariantPrice: MoneyLike } },
): ProductEventProperties["product_viewed"] => ({
  ...productRef(product),
  price: Number(product.priceRange.minVariantPrice.amount),
  currency: product.priceRange.minVariantPrice.currencyCode,
});

/** Null when the line isn't a product variant (nothing to attribute it to). */
export const addedToCartProperties = (
  line: CartLineLike,
): ProductEventProperties["product_added_to_cart"] | null => {
  const { merchandise } = line;
  if (!merchandise.product || !merchandise.id || !merchandise.price) return null;
  return {
    ...productRef(merchandise.product),
    variant_id: numericId(merchandise.id),
    quantity: line.quantity,
    // The unit price charged, not the variant's list price: a subscription
    // line costs less (15% here), and a funnel's revenue must say so.
    price: line.cost
      ? Math.round((Number(line.cost.totalAmount.amount) / line.quantity) * 100) / 100
      : Number(merchandise.price.amount),
    currency: line.cost?.totalAmount.currencyCode ?? merchandise.price.currencyCode,
    selling_plan: line.sellingPlanAllocation?.sellingPlan.name ?? null,
  };
};

export const cartViewedProperties = (
  cart: CartLike,
): ProductEventProperties["cart_viewed"] => ({
  item_count: cart.totalQuantity,
  cart_value: Number(cart.cost.subtotalAmount.amount),
  currency: cart.cost.subtotalAmount.currencyCode,
});

export const checkoutStartedProperties = (
  cart: CartLike,
): ProductEventProperties["checkout_started"] => ({
  ...cartViewedProperties(cart),
  has_subscription: cart.lines.nodes.some((line) => Boolean(line.sellingPlanAllocation)),
});
