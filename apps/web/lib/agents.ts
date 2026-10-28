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

export const markdownResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      // Shared by every agent; an hour is plenty for a demo catalogue, and
      // keeps these off the request budget.
      "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
      vary: "accept",
    },
  });

export const productMarkdown = async (handle: string): Promise<string | null> => {
  const result = await getProduct(handle);
  if (!result.ok || !result.data.product) return null;
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

  return `# ${md(product.title)}

${demoNotice}

${md(product.description)}

## Options

${variants.join("\n")}

Page: ${absoluteUrl(`/products/${product.handle}`)}
`;
};

export const collectionMarkdown = async (handle: string): Promise<string | null> => {
  const result = await getCollection(handle);
  if (!result.ok || !result.data.collection) return null;
  const collection = result.data.collection;
  const products = collection.products.nodes.map(
    (product) =>
      `- [${md(product.title)}](${absoluteUrl(`/products/${product.handle}.md`)}): from ${formatMoney(product.priceRange.minVariantPrice)}`,
  );

  return `# ${md(collection.title)}

${demoNotice}

${md(collection.description)}

${products.length > 0 ? products.join("\n") : "No products in this collection."}

Page: ${absoluteUrl(`/collections/${handle}`)}
`;
};

export const searchMarkdown = async (query: string): Promise<string> => {
  const result = query
    ? await storefront.request(SearchProductsQuery, { query, first: 20 })
    : null;
  const products = result?.ok
    ? result.data.search.nodes.flatMap((node) =>
        node.__typename === "Product" ? [node] : [],
      )
    : [];
  const lines = products.map(
    (product) =>
      `- [${md(product.title)}](${absoluteUrl(`/products/${product.handle}.md`)}): from ${formatMoney(product.priceRange.minVariantPrice)}`,
  );
  return `# Search: ${md(query)}

${demoNotice}

${lines.length > 0 ? lines.join("\n") : "No products match."}
`;
};

export const llmsTxt = async (): Promise<string> => {
  const [collections, policies] = await Promise.all([
    storefront.request(CollectionCardsQuery, {}),
    storefront.request(ShopPoliciesQuery, {}),
  ]);
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

  return `# ${SITE_NAME}

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
`;
};
