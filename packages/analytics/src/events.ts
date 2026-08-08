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

export interface AddedToCartPayload {
  readonly $value: number;
  readonly AddedItemProductName: string;
  readonly AddedItemProductID: number;
  readonly AddedItemPrice: string;
  readonly AddedItemQuantity: number;
  readonly AddedItemURL: string;
  readonly AddedItemImageURL: string;
  readonly ItemNames: readonly string[];
  readonly CheckoutURL: string;
}

export interface StartedCheckoutPayload {
  readonly $value: number;
  readonly ItemNames: readonly string[];
  readonly CheckoutURL: string;
  readonly Items: readonly {
    readonly ProductName: string;
    readonly ProductID: number;
    readonly Quantity: number;
    readonly ItemPrice: string;
    readonly RowTotal: string;
    readonly ProductURL: string;
    readonly ImageURL: string;
    /**
     * Not part of Klaviyo's Shopify schema — added here because it is the only
     * way a flow can distinguish a subscription line from a one-off, and the
     * whole Recharge story depends on that distinction.
     */
    readonly SellingPlanName: string | null;
  }[];
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
 * The canonical product URL for a handle.
 *
 * Deliberately the **Online Store** URL rather than the surface the event came
 * from. Klaviyo email templates link to whatever is in `URL`, and a
 * browse-abandonment email triggered by the mobile app has nowhere sensible to
 * point otherwise. One destination for all three surfaces beats three, and it
 * matches what the theme already sends.
 */
export const productUrl = (storeDomain: string, handle: string): string =>
  `https://${storeDomain}/products/${handle}`;

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

interface ProductLike {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly vendor?: string | null;
  readonly featuredImage?: { readonly url: string } | null;
  readonly priceRange: { readonly minVariantPrice: MoneyLike };
  readonly compareAtPriceRange?: { readonly minVariantPrice: MoneyLike } | null;
}

/**
 * Builds a `Viewed Product` payload matching the theme's.
 *
 * Uses `minVariantPrice`, because that is what Shopify's `product.price`
 * resolves to in Liquid — confirmed against the live theme, which reported
 * £9.95 for a product whose default variant is £24.95.
 */
export const viewedProduct = (
  product: ProductLike,
  storeDomain: string,
): ViewedProductPayload => ({
  Name: product.title,
  ProductID: legacyIdFromGid(product.id),
  Categories: [],
  ImageURL: product.featuredImage?.url ?? "",
  URL: productUrl(storeDomain, product.handle),
  Brand: product.vendor ?? "",
  Price: formatEventPrice(product.priceRange.minVariantPrice),
  Value: product.priceRange.minVariantPrice.amount,
  CompareAtPrice: formatEventPrice(product.compareAtPriceRange?.minVariantPrice),
});

interface CartLineLike {
  readonly quantity: number;
  readonly merchandise: {
    readonly id: string;
    readonly image?: { readonly url: string } | null;
    readonly price: MoneyLike;
    readonly product: { readonly handle: string; readonly title: string };
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

export const addedToCart = (
  cart: CartLike,
  addedLine: CartLineLike,
  storeDomain: string,
): AddedToCartPayload => ({
  $value: Number(cart.cost.subtotalAmount.amount),
  AddedItemProductName: addedLine.merchandise.product.title,
  AddedItemProductID: legacyIdFromGid(addedLine.merchandise.id),
  AddedItemPrice: formatEventPrice(addedLine.merchandise.price),
  AddedItemQuantity: addedLine.quantity,
  AddedItemURL: productUrl(storeDomain, addedLine.merchandise.product.handle),
  AddedItemImageURL: addedLine.merchandise.image?.url ?? "",
  ItemNames: cart.lines.nodes.map((line) => line.merchandise.product.title),
  CheckoutURL: cart.checkoutUrl,
});

export const startedCheckout = (
  cart: CartLike,
  storeDomain: string,
): StartedCheckoutPayload => ({
  $value: Number(cart.cost.subtotalAmount.amount),
  ItemNames: cart.lines.nodes.map((line) => line.merchandise.product.title),
  CheckoutURL: cart.checkoutUrl,
  Items: cart.lines.nodes.map((line) => ({
    ProductName: line.merchandise.product.title,
    ProductID: legacyIdFromGid(line.merchandise.id),
    Quantity: line.quantity,
    ItemPrice: formatEventPrice(line.merchandise.price),
    RowTotal: formatEventPrice({
      amount: String(Number(line.merchandise.price.amount) * line.quantity),
      currencyCode: line.merchandise.price.currencyCode,
    }),
    ProductURL: productUrl(storeDomain, line.merchandise.product.handle),
    ImageURL: line.merchandise.image?.url ?? "",
    SellingPlanName: line.sellingPlanAllocation?.sellingPlan.name ?? null,
  })),
});
