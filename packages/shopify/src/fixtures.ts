import type { Cart } from "./cart";
import type { FilterLike } from "./filters";
import type { ProductByHandleQuery } from "./generated/graphql";
import type { NavLink } from "./nav";
import type { CartSuggestion } from "./recommendations";

/**
 * Sample catalogue data for Storybook, shared by the web and app stories so
 * both render the same products, prices and edge cases.
 *
 * Copied from the store's real catalogue (images are its real CDN files), so
 * stories look like the shop. Never imported by production code: it's a
 * separate entry point, `@formulate/shopify/fixtures`.
 */

const cdn = "https://cdn.shopify.com/s/files/1/1005/8196/6136/files";

/** Money in pounds, typed as Shopify's own money so fixtures fit query types. */
export const gbp = (amount: string) => ({ amount, currencyCode: "GBP" as const });

export interface FixtureProduct {
  readonly handle: string;
  readonly title: string;
  readonly featuredImage: {
    readonly url: string;
    readonly altText: string;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly priceRange: { readonly minVariantPrice: ReturnType<typeof gbp> };
}

const product = (
  handle: string,
  title: string,
  file: string | null,
  price: string,
): FixtureProduct => ({
  handle,
  title,
  featuredImage: file
    ? { url: `${cdn}/${file}`, altText: `${title} packshot`, width: 1200, height: 1200 }
    : null,
  priceRange: { minVariantPrice: gbp(price) },
});

export const FIXTURE_PRODUCTS = {
  magnesium: product(
    "magnesium-glycinate",
    "Magnesium Glycinate",
    "double-helix-magnesium-glycinate-packshot_f2d2bead-d5f1-44ac-966e-fc8aa8bac7b5.png?v=1788033542",
    "17.95",
  ),
  multivitamin: product(
    "daily-multivitamin",
    "Daily Multivitamin",
    "double-helix-daily-multivitamin-concept-packshot.png?v=1787935762",
    "15.95",
  ),
  vitaminD3: product(
    "vitamin-d3",
    "Vitamin D3",
    "double-helix-vitamin-d3-packshot_85f235d3-7800-4451-a54d-a469d0a73d35.png?v=1788032436",
    "9.95",
  ),
  focusSticks: product(
    "citicoline-l-theanine-daily-sticks",
    "Citicoline + L-Theanine Daily Sticks",
    "double-helix-citicoline-l-theanine-citrus-concept-packshot.png?v=1787935773",
    "24.95",
  ),
  /** A product with no image, which every card has to handle. */
  noImage: product("lions-mane-mushroom", "Lion's Mane Mushroom", null, "21.95"),
} as const;

type CartLine = Cart["lines"]["nodes"][number];

const line = (
  id: string,
  item: FixtureProduct,
  quantity: number,
  options: { readonly variant?: string; readonly plan?: string } = {},
): CartLine => {
  const unit = Number(item.priceRange.minVariantPrice.amount);
  return {
    id: `gid://shopify/CartLine/${id}`,
    quantity,
    cost: { totalAmount: gbp((unit * quantity).toFixed(2)) },
    merchandise: {
      id: `gid://shopify/ProductVariant/${id}`,
      title: options.variant ?? "Default Title",
      availableForSale: true,
      image: item.featuredImage,
      price: item.priceRange.minVariantPrice,
      selectedOptions: options.variant
        ? [{ name: "Strength", value: options.variant }]
        : [],
      product: {
        id: `gid://shopify/Product/${id}`,
        handle: item.handle,
        title: item.title,
      },
    },
    sellingPlanAllocation: options.plan
      ? { sellingPlan: { id: "gid://shopify/SellingPlan/1", name: options.plan } }
      : null,
  };
};

const cart = (lines: readonly CartLine[]): Cart => {
  const subtotal = lines
    .reduce((sum, l) => sum + Number(l.cost.totalAmount.amount), 0)
    .toFixed(2);
  return {
    id: "gid://shopify/Cart/fixture?key=fixture",
    checkoutUrl: "https://example.com/checkout",
    totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
    buyerIdentity: { countryCode: "GB" },
    cost: {
      subtotalAmount: gbp(subtotal),
      totalAmount: gbp(subtotal),
      totalTaxAmount: null,
    },
    lines: { nodes: [...lines] },
  };
};

/** Carts at the states the drawer has to handle. */
export const FIXTURE_CARTS = {
  empty: cart([]),
  one: cart([line("1", FIXTURE_PRODUCTS.magnesium, 1, { variant: "375 mg" })]),
  /** Over the free-delivery threshold, with a subscription line. */
  several: cart([
    line("1", FIXTURE_PRODUCTS.magnesium, 1, { variant: "375 mg" }),
    line("2", FIXTURE_PRODUCTS.multivitamin, 1, { plan: "Delivered every 30 days" }),
    line("3", FIXTURE_PRODUCTS.focusSticks, 1, { variant: "Citrus / Unsweetened" }),
  ]),
};

const recommendation = (item: FixtureProduct, variants: number) => ({
  id: `gid://shopify/Product/${item.handle}`,
  handle: item.handle,
  title: item.title,
  availableForSale: true,
  featuredImage: item.featuredImage,
  priceRange: item.priceRange,
  variants: {
    nodes: Array.from({ length: variants }, (_, i) => ({
      id: `gid://shopify/ProductVariant/${item.handle}-${i}`,
      availableForSale: true,
    })),
  },
});

/** One straight-add suggestion and one that needs a choice on the product page. */
export const FIXTURE_SUGGESTIONS: readonly CartSuggestion[] = [
  {
    kind: "add",
    product: recommendation(FIXTURE_PRODUCTS.vitaminD3, 1),
    variantId: "gid://shopify/ProductVariant/vitamin-d3-0",
  },
  { kind: "view", product: recommendation(FIXTURE_PRODUCTS.focusSticks, 2) },
];

type ProductDetail = NonNullable<ProductByHandleQuery["product"]>;
type VariantDetail = ProductDetail["variants"]["nodes"][number];

/** The subscription plan Recharge manages, at 10% off. */
const PLAN = { id: "gid://shopify/SellingPlan/30-day", name: "Delivered every 30 days" };

/**
 * A plan from Shopify's seed data, which no app manages. It's allocated to the
 * variants like a real plan, and the purchase options must leave it out (see
 * `purchasableAllocations`).
 */
const SEED_PLAN = {
  id: "gid://shopify/SellingPlan/seed",
  name: "Seed plan, never charged",
};

interface Axis {
  readonly name: string;
  /** Each value, and whether its variant is in stock. */
  readonly values: readonly (readonly [string, boolean])[];
}

const detail = (
  item: FixtureProduct,
  axis: Axis | null,
  {
    subscription = false,
    inStock = true,
  }: { readonly subscription?: boolean; readonly inStock?: boolean } = {},
): ProductDetail => {
  const price = item.priceRange.minVariantPrice;
  const subscribed = gbp((Number(price.amount) * 0.9).toFixed(2));
  // No options is Shopify's single "Title: Default Title" variant.
  const values = axis?.values ?? [["Default Title", inStock] as const];
  const axisName = axis?.name ?? "Title";

  const variants: VariantDetail[] = values.map(([value, available], index) => ({
    id: `gid://shopify/ProductVariant/${item.handle}-${index}`,
    title: value,
    availableForSale: available,
    sku: null,
    selectedOptions: [{ name: axisName, value }],
    price,
    compareAtPrice: null,
    image: null,
    sellingPlanAllocations: {
      nodes: subscription
        ? [PLAN, SEED_PLAN].map((plan) => ({
            sellingPlan: plan,
            priceAdjustments: [{ price: subscribed }],
          }))
        : [],
    },
  }));

  return {
    id: `gid://shopify/Product/${item.handle}`,
    handle: item.handle,
    title: item.title,
    description: `${item.title}, from the Double Helix range.`,
    vendor: "Double Helix",
    seo: { title: null, description: null },
    breadcrumbCollections: { nodes: [] },
    collections: { nodes: [] },
    compareAtPriceRange: { minVariantPrice: gbp("0.00") },
    featuredImage: item.featuredImage,
    images: { nodes: item.featuredImage ? [item.featuredImage] : [] },
    priceRange: item.priceRange,
    options: [{ name: axisName, optionValues: values.map(([name]) => ({ name })) }],
    sellingPlanGroups: {
      nodes: subscription
        ? [
            {
              name: "Subscribe and save",
              appName: "Recharge Subscriptions",
              options: [{ name: "Delivery", values: [PLAN.name] }],
              sellingPlans: { nodes: [{ id: PLAN.id }] },
            },
            {
              name: "Seed data",
              appName: null,
              options: [{ name: "Delivery", values: [SEED_PLAN.name] }],
              sellingPlans: { nodes: [{ id: SEED_PLAN.id }] },
            },
          ]
        : [],
    },
    variants: { nodes: variants },
  };
};

/** Full products, as the product page queries them, at the states its buy controls handle. */
export const FIXTURE_PRODUCT_DETAILS = {
  /** Two strengths, each one-time or on a subscription. */
  subscription: detail(
    FIXTURE_PRODUCTS.magnesium,
    {
      name: "Strength",
      values: [
        ["375 mg", true],
        ["500 mg", true],
      ],
    },
    { subscription: true },
  ),
  /** One flavour sold out: still selectable, struck through. */
  partlySoldOut: detail(FIXTURE_PRODUCTS.focusSticks, {
    name: "Flavour",
    values: [
      ["Citrus", true],
      ["Berry", false],
    ],
  }),
  /** No options and no plans: a price and a button. */
  simple: detail(FIXTURE_PRODUCTS.vitaminD3, null),
  soldOut: detail(FIXTURE_PRODUCTS.noImage, null, { inStock: false }),
} as const;

/** Filters as the Storefront API returned them for a collection (2026-10-01). */
export const FIXTURE_FILTERS: readonly FilterLike[] = [
  {
    id: "filter.v.availability",
    label: "Availability",
    type: "LIST",
    values: [
      {
        id: "filter.v.availability.1",
        label: "In stock",
        count: 6,
        input: '{"available":true}',
      },
      {
        id: "filter.v.availability.0",
        label: "Out of stock",
        count: 0,
        input: '{"available":false}',
      },
    ],
  },
  {
    id: "filter.v.price",
    label: "Price",
    type: "PRICE_RANGE",
    values: [
      {
        id: "filter.v.price",
        label: "Price",
        count: 0,
        input: '{"price":{"min":0,"max":32.95}}',
      },
    ],
  },
  {
    id: "filter.v.option.flavour",
    label: "Flavour",
    type: "LIST",
    values: [
      {
        id: "filter.v.option.flavour.vanilla",
        label: "Vanilla",
        count: 2,
        input: '{"variantOption":{"name":"flavour","value":"Vanilla"}}',
      },
      {
        id: "filter.v.option.flavour.chocolate",
        label: "Chocolate",
        count: 2,
        input: '{"variantOption":{"name":"flavour","value":"Chocolate"}}',
      },
    ],
  },
];

const collectionLink = (handle: string, title: string): NavLink => ({
  id: `gid://shopify/MenuItem/${handle}`,
  title,
  kind: "collection",
  handle,
  path: `/collections/${handle}`,
});

/** The header's collection links, from the store's main menu. */
export const FIXTURE_NAV_LINKS: readonly NavLink[] = [
  collectionLink("sleep", "Sleep"),
  collectionLink("focus", "Focus"),
  collectionLink("performance", "Performance"),
  collectionLink("daily-health", "Daily health"),
  collectionLink("all", "Shop all"),
];
