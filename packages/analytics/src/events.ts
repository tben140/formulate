/**
 * The event contract every surface emits into Klaviyo.
 *
 * ⚠️ These shapes are NOT ours to design. The Liquid theme already emits
 * Klaviyo events automatically — the app embed reads Shopify's `window.meta`
 * and pushes them without any code from us. So the headless surfaces have to
 * match what the theme already sends, or Klaviyo sees two unrelated datasets.
 *
 * That failure is silent and expensive: a flow filtering on `ProductID` would
 * fire for theme traffic and quietly miss web and mobile entirely. Nothing
 * errors, nothing logs, and the numbers look plausible.
 *
 * Captured from the running theme on 2026-08-08:
 *
 *     ["track", "Viewed Product", {
 *       "Name": "Selling Plans Ski Wax",
 *       "ProductID": 10762122068280,
 *       "Categories": [],
 *       "ImageURL": "/cdn/shop/files/snowboard_wax_grande.png?v=1783280473",
 *       "URL": "https://tben140plus-xcorpito.myshopify.com/products/…",
 *       "Brand": "tben140plus",
 *       "Price": "£9.95",
 *       "Value": "9.95",
 *       "CompareAtPrice": "£0.00"
 *     }]
 *
 * Note the capitalised keys — that is Klaviyo's Shopify convention, not a
 * style choice, and it is why this file does not use the workspace's usual
 * camelCase.
 */

/** Event names, exactly as the theme emits them. */
export const EVENTS = {
  viewedProduct: "Viewed Product",
  addedToCart: "Added to Cart",
  startedCheckout: "Started Checkout",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export interface ViewedProductPayload {
  readonly Name: string;
  readonly ProductID: number;
  readonly Categories: readonly string[];
  readonly ImageURL: string;
  readonly URL: string;
  readonly Brand: string;
  readonly Price: string;
  readonly Value: string;
  readonly CompareAtPrice: string;
}

/**
 * One cart line, as Klaviyo's Shopify schema lists it under `Items` in both
 * Added to Cart and Started Checkout.
 *
 * ⚠️ `ProductID` is the **product's** id, as in Viewed Product, so a flow can
 * match a browse to a cart and a product block can look the item up. The
 * variant is carried beside it. Until 2026-11-15 the headless surfaces sent
 * the variant id here, which matched nothing (finding 5 of the batch review).
 */
export interface CartItemPayload {
  readonly ProductName: string;
  readonly ProductID: number;
  readonly VariantID: number;
  readonly Quantity: number;
  readonly ItemPrice: string;
  readonly RowTotal: string;
  readonly ProductURL: string;
  readonly ImageURL: string;
  readonly ProductCategories: readonly string[];
  /**
   * Not part of Klaviyo's Shopify schema — added here because it is the only
   * way a flow can distinguish a subscription line from a one-off, and the
   * whole Recharge story depends on that distinction.
   */
  readonly SellingPlanName: string | null;
}

export interface AddedToCartPayload {
  readonly $value: number;
  readonly AddedItemProductName: string;
  /** The product's id, as Viewed Product sends it. */
  readonly AddedItemProductID: number;
  readonly AddedItemVariantID: number;
  readonly AddedItemCategories: readonly string[];
  readonly AddedItemPrice: string;
  readonly AddedItemQuantity: number;
  readonly AddedItemURL: string;
  readonly AddedItemImageURL: string;
  readonly ItemNames: readonly string[];
  readonly CheckoutURL: string;
  readonly Items: readonly CartItemPayload[];
}

export interface StartedCheckoutPayload {
  readonly $value: number;
  readonly ItemNames: readonly string[];
  readonly CheckoutURL: string;
  readonly Items: readonly CartItemPayload[];
}

/**
 * Extracts the numeric id Klaviyo expects from a Storefront global id.
 *
 * ⚠️ Do not skip this. The theme sends `ProductID: 10762122068280` — the
 * legacy numeric id — while the Storefront API returns
 * `gid://shopify/Product/10762122068280`. Sending the gid produces events that
 * look fine in Klaviyo's feed and never match a theme-generated event, so
 * segments split in two without any error.
 *
 * Returns 0 for anything unparseable rather than throwing: a malformed id
 * should not take down a product page over analytics.
 */
export const legacyIdFromGid = (gid: string): number => {
  const last = gid.split("/").pop() ?? "";
  // Strip any `?key=`-style suffix before parsing.
  const digits = last.split("?")[0] ?? "";
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * The product URL a Klaviyo email links to, on the public site.
 *
 * `siteOrigin` is the headless site's origin (`https://www.…`), the one place
 * every product page lives, not the `*.myshopify.com` host the Storefront
 * client talks to: that host is the Online Store, which is password-protected
 * on a development store and is not where shoppers are sent. Web passes
 * `siteUrl.origin` (lib/site.ts); the app passes the same origin, where #254's
 * app links open the product in the app on a phone that has it. The theme's
 * events come from Klaviyo's app embed and link to the Online Store's own
 * host, which is right for a theme shopper.
 *
 * Until 2026-11-15 this built `https://<store domain>/products/…`, so every
 * flow email would have pointed at the password page (batch review, finding 5).
 */
export const productUrl = (siteOrigin: string, handle: string): string =>
  `${siteOrigin.replace(/\/+$/, "")}/products/${handle}`;

interface MoneyLike {
  readonly amount: string;
  readonly currencyCode: string;
}

/**
 * Formats money the way the theme does — symbol included, e.g. "£9.95".
 *
 * `Price` carries the symbol and `Value` does not; Klaviyo uses the former for
 * display in emails and the latter for arithmetic in flows. Getting them the
 * wrong way round produces flows that compare "£9.95" numerically.
 */
export const formatEventPrice = (money: MoneyLike | null | undefined): string => {
  if (!money) return "";
  const amount = Number(money.amount);
  if (!Number.isFinite(amount)) return "";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: money.currencyCode,
  }).format(amount);
};

interface InCollections {
  /** Optional so a caller without collections still compiles; it then sends []. */
  readonly collections?: { readonly nodes: readonly { readonly title: string }[] } | null;
}

interface ProductLike extends InCollections {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly vendor?: string | null;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  readonly compareAtPriceRange?: { readonly minVariantPrice: MoneyLike } | null;
}

/**
 * The theme's `Categories`: the product's collection titles, **sorted by title**.
 *
 * ⚠️ The sort is the whole point. The Storefront API returns a product's
 * collections in creation order, while the theme (Liquid's
 * `product.collections`) lists them alphabetically. Measured 2026-09-26 on
 * Daily Multivitamin: Storefront gave Cellular, Best Sellers, Daily Essentials;
 * the theme sent Best Sellers, Cellular, Daily Essentials. Passing the API's
 * order through would look right for most products and differ for some.
 *
 * Plain code-point order. Every title in the catalogue starts with a capital,
 * so whether Liquid's sort is case-sensitive has not been observed.
 *
 * Both surfaces only see collections published to their own channel (Online
 * Store for the theme, Headless for web), so the two lists match only while
 * both channels carry the same collections.
 */
const categories = (product: InCollections): readonly string[] =>
  (product.collections?.nodes ?? []).map((collection) => collection.title).sort();

/**
 * Builds a `Viewed Product` payload matching the theme's.
 *
 * Uses `minVariantPrice`, because that is what Shopify's `product.price`
 * resolves to in Liquid — confirmed against the live theme, which reported
 * £9.95 for a product whose default variant is £24.95.
 */
export const viewedProduct = (
  product: ProductLike,
  siteOrigin: string,
): ViewedProductPayload => ({
  Name: product.title,
  ProductID: legacyIdFromGid(product.id),
  Categories: categories(product),
  ImageURL: product.featuredImage?.url ?? "",
  URL: productUrl(siteOrigin, product.handle),
  Brand: product.vendor ?? "",
  Price: formatEventPrice(product.priceRange.minVariantPrice),
  Value: product.priceRange.minVariantPrice.amount,
  CompareAtPrice: formatEventPrice(product.compareAtPriceRange?.minVariantPrice),
});

interface CartLineLike {
  readonly quantity: number;
  /** What the line actually costs: a subscription line is below list price. */
  readonly cost: { readonly totalAmount: MoneyLike };
  readonly merchandise: {
    /** The variant's gid. */
    readonly id: string;
    readonly image?: { readonly url: string } | null;
    readonly price: MoneyLike;
    readonly product: InCollections & {
      readonly id: string;
      readonly handle: string;
      readonly title: string;
    };
  };
  readonly sellingPlanAllocation?: {
    readonly sellingPlan: { readonly name: string };
  } | null;
}

interface CartLike {
  readonly checkoutUrl: string;
  readonly cost: { readonly subtotalAmount: MoneyLike };
  readonly lines: { readonly nodes: readonly CartLineLike[] };
}

/**
 * The price one unit of the line is charged at: the line's cost divided by its
 * quantity, not `merchandise.price`, which is the variant's list price and
 * overstates a subscription line (£24.95 listed, £19.95 on the plan).
 * `product-analytics.ts` reads the same source for PostHog.
 */
const chargedUnitPrice = (line: CartLineLike): MoneyLike => ({
  amount: String(Number(line.cost.totalAmount.amount) / Math.max(line.quantity, 1)),
  currencyCode: line.cost.totalAmount.currencyCode,
});

const cartItem = (line: CartLineLike, siteOrigin: string): CartItemPayload => ({
  ProductName: line.merchandise.product.title,
  ProductID: legacyIdFromGid(line.merchandise.product.id),
  VariantID: legacyIdFromGid(line.merchandise.id),
  Quantity: line.quantity,
  ItemPrice: formatEventPrice(chargedUnitPrice(line)),
  RowTotal: formatEventPrice(line.cost.totalAmount),
  ProductURL: productUrl(siteOrigin, line.merchandise.product.handle),
  ImageURL: line.merchandise.image?.url ?? "",
  ProductCategories: categories(line.merchandise.product),
  SellingPlanName: line.sellingPlanAllocation?.sellingPlan.name ?? null,
});

/**
 * `quantity` is how many this add put in, not the line's new total: adding a
 * second unit to a line of one reports 1, not 2.
 */
export const addedToCart = (
  cart: CartLike,
  addedLine: CartLineLike,
  siteOrigin: string,
  quantity: number,
): AddedToCartPayload => ({
  $value: Number(cart.cost.subtotalAmount.amount),
  AddedItemProductName: addedLine.merchandise.product.title,
  AddedItemProductID: legacyIdFromGid(addedLine.merchandise.product.id),
  AddedItemVariantID: legacyIdFromGid(addedLine.merchandise.id),
  AddedItemCategories: categories(addedLine.merchandise.product),
  AddedItemPrice: formatEventPrice(chargedUnitPrice(addedLine)),
  AddedItemQuantity: quantity,
  AddedItemURL: productUrl(siteOrigin, addedLine.merchandise.product.handle),
  AddedItemImageURL: addedLine.merchandise.image?.url ?? "",
  ItemNames: cart.lines.nodes.map((line) => line.merchandise.product.title),
  CheckoutURL: cart.checkoutUrl,
  Items: cart.lines.nodes.map((line) => cartItem(line, siteOrigin)),
});

/**
 * ⚠️ **This is not the abandoned-cart trigger. Do not wire a flow to it.**
 *
 * Klaviyo's Shopify integration emits its own `Checkout Started` — note the
 * reversed word order — server-side, from Shopify. That one covers all three
 * surfaces, because every surface hands off to Shopify's checkout, and it
 * cannot be blocked. This one fires client-side from apps/web only, so a
 * theme or mobile shopper abandoning a cart would produce nothing.
 *
 * It is kept for two reasons the platform metric cannot serve:
 *
 * 1. **`SellingPlanName` per line.** Shopify's `Checkout Started` does not
 *    distinguish a subscription line from a one-off, and the entire Recharge
 *    story depends on that distinction.
 * 2. Parity of the emitted event stream across the three surfaces, which is
 *    what makes the headless surfaces legible in Klaviyo at all.
 *
 * See docs/integration-klaviyo.md — "Which checkout metric".
 */
export const startedCheckout = (
  cart: CartLike,
  siteOrigin: string,
): StartedCheckoutPayload => ({
  $value: Number(cart.cost.subtotalAmount.amount),
  ItemNames: cart.lines.nodes.map((line) => line.merchandise.product.title),
  CheckoutURL: cart.checkoutUrl,
  Items: cart.lines.nodes.map((line) => cartItem(line, siteOrigin)),
});
