import {
  CollectionCardsQuery,
  DEMO_STORE_NOTICE,
  SearchProductsQuery,
  ShopPoliciesQuery,
  formatMoney,
  purchasableSellingPlanGroups,
} from "@formulate/shopify";

import { getCollection, getProduct } from "./catalogue";
import { SITE_NAME, absoluteUrl } from "./site";
import { storefront } from "./storefront";

/**
 * The storefront as AI agents read it (Shopify Editions Fall '26).
 *
 * Agents get the same catalogue shoppers do, as Markdown: `/llms.txt` says
 * what the store is and how to buy; `/products/<handle>.md` and
 * `/collections/<handle>.md` (or the page URL with `Accept: text/markdown`)
 * give one page each. Buying goes through Shopify's own Universal Commerce
 * Protocol endpoint, which this site points to at `/.well-known/ucp`
 * (next.config.ts). Nothing here can take an order: UCP checkout does that,
 * and only after the shopper confirms.
 *
 * ⚠️ Every document says it's a demo store with a test checkout, as the
 * pages do. An agent must not tell anyone they can buy here for real.
 */

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";

export const ucpProfileUrl = (): string => `https://${STORE_DOMAIN}/.well-known/ucp`;

/** Markdown-safe text: no stray emphasis or links from product copy. */
const md = (text: string): string => text.replace(/([\\`*_[\]<>#|])/g, "\\$1").trim();

const demoNotice = `> **${DEMO_STORE_NOTICE.label}:** ${DEMO_STORE_NOTICE.message}`;

/** A document, or why there isn't one. */
export interface MarkdownDoc {
  readonly status: 200 | 404 | 503;
  readonly body: string;
}

const NOT_FOUND: MarkdownDoc = { status: 404, body: "# Not found\n" };

/**
 * Shopify didn't answer. Never cached: a failure must not be served to agents
 * for an hour as if it were the catalogue.
 */
const UNAVAILABLE: MarkdownDoc = {
  status: 503,
  body: "# Temporarily unavailable\n\nThe catalogue couldn't be loaded. Try again shortly.\n",
};

const found = (body: string): MarkdownDoc => ({ status: 200, body });

export const markdownResponse = ({ status, body }: MarkdownDoc): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // A real answer is shared by every agent for an hour, which is plenty for
      // a demo catalogue and keeps these off the request budget. Anything else
      // isn't cached.
      "cache-control":
        status === 200
          ? "public, s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      vary: "accept",
    },
  });

export const productMarkdown = async (handle: string): Promise<MarkdownDoc> => {
  const result = await getProduct(handle);
  if (!result.ok) return UNAVAILABLE;
  if (!result.data.product) return NOT_FOUND;
  const product = result.data.product;

  const ownedPlanIds = new Set(
    purchasableSellingPlanGroups(product.sellingPlanGroups.nodes).flatMap((group) =>
      group.sellingPlans.nodes.map((plan) => plan.id),
    ),
  );

  const variants = product.variants.nodes.map((variant) => {
    const plans = variant.sellingPlanAllocations.nodes
      .filter((allocation) => ownedPlanIds.has(allocation.sellingPlan.id))
      .map((allocation) => {
        const price = allocation.priceAdjustments[0]?.price;
        return `  - Subscribe: ${md(allocation.sellingPlan.name)}${price ? `, ${formatMoney(price)} a delivery` : ""} (selling plan \`${allocation.sellingPlan.id}\`)`;
      });
    return [
      `- **${md(variant.title)}**: ${formatMoney(variant.price)}, ${variant.availableForSale ? "in stock" : "sold out"} (variant \`${variant.id}\`)`,
      ...plans,
    ].join("\n");
  });

  return found(`# ${md(product.title)}

${demoNotice}

${md(product.description)}

## Options

${variants.join("\n")}

Page: ${absoluteUrl(`/products/${product.handle}`)}
`);
};

export const collectionMarkdown = async (handle: string): Promise<MarkdownDoc> => {
  const result = await getCollection(handle);
  if (!result.ok) return UNAVAILABLE;
  if (!result.data.collection) return NOT_FOUND;
  const collection = result.data.collection;
  const products = collection.products.nodes.map(
    (product) =>
      `- [${md(product.title)}](${absoluteUrl(`/products/${product.handle}.md`)}): from ${formatMoney(product.priceRange.minVariantPrice)}`,
  );

  return found(`# ${md(collection.title)}

${demoNotice}

${md(collection.description)}

${products.length > 0 ? products.join("\n") : "No products in this collection."}

Page: ${absoluteUrl(`/collections/${handle}`)}
`);
};

export const searchMarkdown = async (query: string): Promise<MarkdownDoc> => {
  const result = query
    ? await storefront.request(SearchProductsQuery, { query, first: 20 })
    : null;
  if (result && !result.ok) return UNAVAILABLE;
  const products = result?.ok
    ? result.data.search.nodes.flatMap((node) =>
        node.__typename === "Product" ? [node] : [],
      )
    : [];
  const lines = products.map(
    (product) =>
      `- [${md(product.title)}](${absoluteUrl(`/products/${product.handle}.md`)}): from ${formatMoney(product.priceRange.minVariantPrice)}`,
  );
  return found(`# Search: ${md(query)}

${demoNotice}

${lines.length > 0 ? lines.join("\n") : "No products match."}
`);
};

export const llmsTxt = async (): Promise<MarkdownDoc> => {
  const [collections, policies] = await Promise.all([
    storefront.request(CollectionCardsQuery, {}),
    storefront.request(ShopPoliciesQuery, {}),
  ]);
  if (!collections.ok || !policies.ok) return UNAVAILABLE;
  const collectionLines = collections.ok
    ? collections.data.collections.nodes
        .filter((collection) => collection.products.nodes.length > 0)
        .map(
          (collection) =>
            `- [${md(collection.title)}](${absoluteUrl(`/collections/${collection.handle}.md`)})`,
        )
    : [];
  const shop = policies.ok ? policies.data.shop : null;
  const policyLines = shop
    ? [
        shop.privacyPolicy,
        shop.refundPolicy,
        shop.termsOfService,
        shop.shippingPolicy,
        shop.subscriptionPolicy,
      ]
        .filter((policy) => policy != null)
        .map(
          (policy) =>
            `- [${md(policy.title)}](${absoluteUrl(`/policies/${policy.handle}`)})`,
        )
    : [];

  return found(`# ${SITE_NAME}

> Supplements, bought once or on subscription, from a UK store.

${demoNotice}

## Read the catalogue

Product and collection pages come as Markdown at the page URL with \`.md\` added, or with an \`Accept: text/markdown\` header. Prices are in GBP for the UK.

${collectionLines.join("\n")}

## Buy for a shopper

Search, carts and checkout use Shopify's Universal Commerce Protocol (UCP).

- [UCP profile](${absoluteUrl("/.well-known/ucp")}): the store's capabilities and its MCP endpoint.
- Complete a checkout only after the shopper has approved it. Checkout here is a test: no one is charged and nothing ships.

## Policies

${policyLines.join("\n")}
`);
};
