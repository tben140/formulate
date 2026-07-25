/**
 * Proves a Storefront token works before any UI exists to blame.
 *
 * Deliberately dependency-free and self-contained — it does not import the
 * package it is testing. If this passes but an app shows nothing, the problem
 * is the app; if this fails, the problem is the credential or the sales
 * channel the products are published to.
 *
 *   node --env-file-if-exists=../../apps/web/.env.local scripts/smoke-test.mjs
 */

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";

if (!domain || !token) {
  console.error(
    "Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_STOREFRONT_TOKEN.\n" +
      "Copy .env.example to apps/web/.env.local and fill it in.",
  );
  process.exit(1);
}

const query = `
  query Smoke($handle: String!) {
    shop { name }
    collection(handle: $handle) {
      title
      products(first: 10) {
        nodes {
          handle
          title
          priceRange { minVariantPrice { amount currencyCode } }
        }
      }
    }
  }
`;

const response = await fetch(`https://${domain}/api/${apiVersion}/graphql.json`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Shopify-Storefront-Access-Token": token,
  },
  body: JSON.stringify({
    query,
    variables: { handle: "automated-collection" },
  }),
});

if (!response.ok) {
  console.error(`HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const body = await response.json();

if (body.errors) {
  console.error("GraphQL errors:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

console.log(`Shop:       ${body.data.shop.name}`);
console.log(`Collection: ${body.data.collection?.title ?? "(not visible to this token)"}`);

const products = body.data.collection?.products.nodes ?? [];
console.log(`Products:   ${products.length}`);

for (const product of products) {
  const { amount, currencyCode } = product.priceRange.minVariantPrice;
  console.log(`  - ${product.title} — ${amount} ${currencyCode}`);
}

if (products.length === 0) {
  console.error(
    "\nNo products returned. The token works but the catalogue is not published\n" +
      "to the sales channel this token belongs to. Publish products to the\n" +
      "Headless/Online Store channel in the Shopify admin.",
  );
  process.exit(1);
}
