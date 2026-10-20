#!/usr/bin/env node
/**
 * Every subscription ships free (SHO-99), but only if its selling plan group
 * is attached to the "Subscriptions: free standard delivery" delivery
 * profile. Recharge creates three groups for every product it sells on
 * subscription, so a new product's groups start outside the profile, and its
 * renewals quietly charge delivery again.
 *
 * This lists the groups that are missing, and with --fix attaches them.
 *
 *   SHOPIFY_STORE_DOMAIN=… SHOPIFY_ADMIN_TOKEN=… node scripts/check-subscription-delivery.mjs [--fix]
 *
 * The Admin token needs read_products and read_shipping (write_shipping for
 * --fix). It's a secret: pass it in the environment, never commit it. Exits
 * 1 when groups are missing and --fix wasn't given, so it can run in CI.
 */

const PROFILE_NAME = "Subscriptions: free standard delivery";
const API_VERSION = "2026-04";

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_TOKEN;
const fix = process.argv.includes("--fix");

if (!domain || !token) {
  console.error("Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN.");
  process.exit(2);
}

const admin = async (query, variables = {}) => {
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.errors) {
    throw new Error(`Admin API ${response.status}: ${JSON.stringify(body?.errors ?? body)}`);
  }
  return body.data;
};

/** Every page of a connection, as a flat list of nodes. */
const all = async (query, path) => {
  const nodes = [];
  let after = null;
  for (;;) {
    const data = await admin(query, { after });
    const connection = path(data);
    nodes.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return nodes;
    after = connection.pageInfo.endCursor;
  }
};

const profiles = await admin(`{ deliveryProfiles(first: 20) { nodes { id name } } }`);
const profile = profiles.deliveryProfiles.nodes.find((p) => p.name === PROFILE_NAME);
if (!profile) {
  console.error(`No delivery profile named "${PROFILE_NAME}". See SHO-99.`);
  process.exit(1);
}

const attached = new Set(
  (
    await all(
      `query ($after: String) { deliveryProfile(id: "${profile.id}") {
         sellingPlanGroups(first: 100, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } } }`,
      (data) => data.deliveryProfile.sellingPlanGroups,
    )
  ).map((group) => group.id),
);

// Groups reached through products: the app-owned groups aren't listed by the
// shop-level sellingPlanGroups query, but they are on each product.
const products = await all(
  `query ($after: String) { products(first: 50, after: $after) {
     nodes { title sellingPlanGroups(first: 20) { nodes { id name } } }
     pageInfo { hasNextPage endCursor } } }`,
  (data) => data.products,
);

const missing = products.flatMap((product) =>
  product.sellingPlanGroups.nodes
    .filter((group) => !attached.has(group.id))
    .map((group) => ({ ...group, product: product.title })),
);

if (missing.length === 0) {
  console.log(`All ${attached.size} subscription plan groups ship free.`);
  process.exit(0);
}

console.log(`${missing.length} plan group(s) not in "${PROFILE_NAME}":`);
for (const group of missing) console.log(`  ${group.product}: ${group.name} (${group.id})`);

if (!fix) {
  console.log("Run again with --fix to attach them.");
  process.exit(1);
}

const result = await admin(
  `mutation ($id: ID!, $groups: [ID!]!) {
     deliveryProfileUpdate(id: $id, profile: { sellingPlanGroupsToAssociate: $groups }) {
       userErrors { field message } } }`,
  { id: profile.id, groups: [...new Set(missing.map((group) => group.id))] },
);
const errors = result.deliveryProfileUpdate.userErrors;
if (errors.length) {
  console.error("Shopify refused:", errors);
  process.exit(1);
}
console.log(`Attached ${missing.length}. New products' subscriptions now ship free.`);
